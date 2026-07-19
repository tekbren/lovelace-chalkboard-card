// Lovelace Chalkboard Card
// https://github.com/tekbren/lovelace-chalkboard-card
//
// A freeform notes card styled as a real chalkboard - dark textured
// background, grainy chalk-style strokes instead of clean vector lines,
// an eraser that smudges rather than fully resetting (like a real board),
// and pinch-to-zoom/pan for finer writing or reading detail. Single
// dependency-free JS file, no build step.
//
// This is deliberately for casual notes, not permanent artwork: there is
// no save/export/undo/history. It auto-persists silently to this browser's
// own localStorage (per-card-id) so it survives reloads/reboots on this
// device, and nothing more - the whole point is to encourage writing over
// whatever's there rather than treating it as precious.
(function () {
  "use strict";

  const CHALK_COLORS = ["#f5f5f0", "#f4e04d", "#f28fb0"]; // white, yellow, pink
  const MAX_ZOOM = 3;
  const MIN_ZOOM = 1;
  const SAVE_DEBOUNCE_MS = 800;
  const ERASE_ALPHA = 0.78; // <1 = smudge, doesn't fully clear in one pass

  class ChalkboardCard extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this._color = CHALK_COLORS[0];
      this._zoom = 1;
      this._panX = 0;
      this._panY = 0;
      this._pointers = new Map();
      this._pinchStart = null;
      this._drawing = false;
      this._lastPoint = null;
      this._saveTimer = null;
    }

    setConfig(config) {
      this._config = config || {};
      this._storageKey = "chalkboard-card:" + (this._config.id || "default");
      this._render();
    }

    // Required by Lovelace even though this card doesn't use entity state.
    set hass(hass) {
      this._hass = hass;
    }

    getCardSize() {
      return 4;
    }

    connectedCallback() {
      if (this._built) return;
      this._built = true;
      requestAnimationFrame(() => this._setupCanvas());
    }

    _render() {
      if (this.shadowRoot.firstChild) return;
      this.shadowRoot.innerHTML = `
        <style>
          ha-card { overflow: hidden; }
          .wrap {
            position: relative;
            width: 100%;
            height: ${this._config.height || "360px"};
            overflow: hidden;
            touch-action: none;
            background: #14251b;
          }
          canvas {
            position: absolute;
            top: 0; left: 0;
            width: 100%; height: 100%;
            cursor: crosshair;
          }
          .toolbar {
            position: absolute;
            top: 8px; right: 8px;
            display: flex;
            gap: 8px;
            z-index: 2;
          }
          .swatch {
            width: 28px; height: 28px;
            border-radius: 50%;
            border: 2px solid rgba(255,255,255,0.5);
          }
          .swatch.active { border-color: #fff; box-shadow: 0 0 0 2px rgba(0,0,0,.4); }
          .btn {
            background: rgba(0,0,0,0.4);
            color: #eee;
            border: 1px solid rgba(255,255,255,0.3);
            border-radius: 6px;
            font-size: 13px;
            padding: 4px 10px;
          }
        </style>
        <ha-card>
          <div class="wrap">
            <canvas></canvas>
            <div class="toolbar">
              ${CHALK_COLORS.map((c, i) => `<button class="swatch${i === 0 ? " active" : ""}" data-color="${c}" style="background:${c}"></button>`).join("")}
              <button class="btn reset-view">⤢ Reset view</button>
              <button class="btn erase">🧹 Erase</button>
            </div>
          </div>
        </ha-card>
      `;
    }

    _setupCanvas() {
      const wrap = this.shadowRoot.querySelector(".wrap");
      const canvas = this.shadowRoot.querySelector("canvas");
      this._canvas = canvas;
      this._ctx = canvas.getContext("2d");

      const dpr = window.devicePixelRatio || 1;
      const rect = wrap.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));

      this._buildTexture();
      this._loadOrInit();

      canvas.addEventListener("pointerdown", (e) => this._onPointerDown(e));
      canvas.addEventListener("pointermove", (e) => this._onPointerMove(e));
      canvas.addEventListener("pointerup", (e) => this._onPointerUp(e));
      canvas.addEventListener("pointercancel", (e) => this._onPointerUp(e));

      this.shadowRoot.querySelectorAll(".swatch").forEach((btn) => {
        btn.addEventListener("click", () => {
          this._color = btn.dataset.color;
          this.shadowRoot.querySelectorAll(".swatch").forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
        });
      });
      this.shadowRoot.querySelector(".erase").addEventListener("click", () => this._erase());
      this.shadowRoot.querySelector(".reset-view").addEventListener("click", () => this._resetView());
    }

    // Procedural chalkboard texture (slate gradient + speckle), cached once
    // so we're not regenerating noise on every erase/redraw.
    _buildTexture() {
      const { width, height } = this._canvas;
      const tex = document.createElement("canvas");
      tex.width = width;
      tex.height = height;
      const tctx = tex.getContext("2d");

      const grad = tctx.createRadialGradient(
        width / 2, height / 2, 0,
        width / 2, height / 2, Math.max(width, height) / 1.3
      );
      grad.addColorStop(0, "#1f3a2b");
      grad.addColorStop(1, "#132318");
      tctx.fillStyle = grad;
      tctx.fillRect(0, 0, width, height);

      const speckleCount = Math.floor((width * height) / 900);
      for (let i = 0; i < speckleCount; i++) {
        const x = Math.random() * width;
        const y = Math.random() * height;
        const r = Math.random() * 1.4;
        tctx.fillStyle = `rgba(255,255,255,${(Math.random() * 0.05).toFixed(3)})`;
        tctx.beginPath();
        tctx.arc(x, y, r, 0, Math.PI * 2);
        tctx.fill();
      }
      this._texture = tex;
    }

    _loadOrInit() {
      const saved = localStorage.getItem(this._storageKey);
      if (saved) {
        const img = new Image();
        img.onload = () => {
          this._ctx.drawImage(img, 0, 0, this._canvas.width, this._canvas.height);
        };
        img.src = saved;
      } else {
        this._ctx.drawImage(this._texture, 0, 0);
      }
    }

    _scheduleSave() {
      if (this._saveTimer) clearTimeout(this._saveTimer);
      this._saveTimer = setTimeout(() => {
        try {
          localStorage.setItem(this._storageKey, this._canvas.toDataURL("image/png"));
        } catch (e) {
          // localStorage full/unavailable - notes just won't persist, not fatal
        }
      }, SAVE_DEBOUNCE_MS);
    }

    _canvasPoint(e) {
      const rect = this._canvas.getBoundingClientRect();
      // Undo the CSS pan/zoom transform to get the real drawing-surface point.
      const cssX = e.clientX - rect.left;
      const cssY = e.clientY - rect.top;
      const x = ((cssX - this._panX) / this._zoom) * (this._canvas.width / rect.width);
      const y = ((cssY - this._panY) / this._zoom) * (this._canvas.height / rect.height);
      return { x, y };
    }

    _onPointerDown(e) {
      this._canvas.setPointerCapture(e.pointerId);
      this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (this._pointers.size === 2) {
        this._drawing = false;
        const pts = Array.from(this._pointers.values());
        this._pinchStart = {
          dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
          zoom: this._zoom,
          midX: (pts[0].x + pts[1].x) / 2,
          midY: (pts[0].y + pts[1].y) / 2,
          panX: this._panX,
          panY: this._panY
        };
      } else if (this._pointers.size === 1) {
        this._drawing = true;
        this._lastPoint = this._canvasPoint(e);
      }
    }

    _onPointerMove(e) {
      if (!this._pointers.has(e.pointerId)) return;
      this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (this._pointers.size === 2 && this._pinchStart) {
        const pts = Array.from(this._pointers.values());
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const scale = dist / (this._pinchStart.dist || 1);
        this._zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this._pinchStart.zoom * scale));
        this._panX = this._pinchStart.panX;
        this._panY = this._pinchStart.panY;
        this._applyTransform();
        return;
      }

      if (this._drawing && this._pointers.size === 1) {
        const p = this._canvasPoint(e);
        this._drawChalkSegment(this._lastPoint, p);
        this._lastPoint = p;
      }
    }

    _onPointerUp(e) {
      this._pointers.delete(e.pointerId);
      if (this._pointers.size < 2) this._pinchStart = null;
      if (this._pointers.size === 0) {
        if (this._drawing) this._scheduleSave();
        this._drawing = false;
        this._lastPoint = null;
      }
    }

    _applyTransform() {
      this._canvas.style.transformOrigin = "0 0";
      this._canvas.style.transform = `translate(${this._panX}px, ${this._panY}px) scale(${this._zoom})`;
    }

    _resetView() {
      this._zoom = 1;
      this._panX = 0;
      this._panY = 0;
      this._applyTransform();
    }

    // Grainy, slightly-irregular stroke instead of one smooth vector line -
    // several jittered overlapping sub-strokes at partial opacity.
    _drawChalkSegment(from, to) {
      if (!from || !to) return;
      const ctx = this._ctx;
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const dpr = window.devicePixelRatio || 1;

      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (let i = 0; i < 4; i++) {
        const jitter = (Math.random() - 0.5) * 1.6 * dpr;
        ctx.beginPath();
        ctx.moveTo(from.x + nx * jitter, from.y + ny * jitter);
        ctx.lineTo(to.x + nx * jitter, to.y + ny * jitter);
        ctx.strokeStyle = this._color;
        ctx.globalAlpha = 0.18 + Math.random() * 0.12;
        ctx.lineWidth = (1.5 + Math.random() * 1.2) * dpr;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // Eraser pass: blend the chalkboard texture back over the top at less
    // than full opacity, so it smudges old content rather than a pristine
    // reset - matches a real chalkboard eraser, which never fully cleans in
    // one pass either.
    _erase() {
      const ctx = this._ctx;
      ctx.globalAlpha = ERASE_ALPHA;
      ctx.drawImage(this._texture, 0, 0);
      ctx.globalAlpha = 1;
      this._scheduleSave();
    }
  }

  customElements.define("chalkboard-card", ChalkboardCard);

  window.customCards = window.customCards || [];
  window.customCards.push({
    type: "chalkboard-card",
    name: "Chalkboard Card",
    description: "A chalkboard-style freeform notes card - grainy chalk strokes, textured slate background, smudgy eraser, pinch-to-zoom."
  });
})();
