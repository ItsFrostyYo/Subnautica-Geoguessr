// GameMap.js
export class GameMap {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");

    this.image = new Image();
    this.image.src = options.imageSrc || "map.png";

    // standard options
    this.worldSize = options.worldSize || 2048;
    this.zoomSpeed = options.zoomSpeed || 1.25;
    this.zoomLerpSpeed = options.zoomLerpSpeed || 0.15;
    this.minZoom = options.minZoom || 0.21;
    this.maxZoom = options.maxZoom || 8;
    this.dragThreshhold = options.dragThreshhold || 4;

    this.camera = {
      x: this.worldSize / 2,
      y: this.worldSize / 2,
      zoom: 1,
      targetZoom: 1
    };

    // markers are in game-world coordinates: { x: ..., y: ... } in range [0..worldSize]
    this.guessMarker = null;
    this.actualMarker = null;

    this.dragging = false;
    this.lastMouse = { x: 0, y: 0 };
    this.mouseMoved = false;

    this._setupEvents();

    // allow external callers to override resize behavior (we do this from game.html)
    this._externalResize = null;

    window.addEventListener("resize", () => {
      if (typeof this._externalResize === "function") {
        this._externalResize();
      } else {
        this._resize();
      }
    });
    this.image.onload = () => {
      if (typeof this._externalResize === "function") {
        this._externalResize();
      } else {
        this._resize();
      }
      this._animate();
    };
  }

  _setupEvents() {
    const c = this.canvas;

    const getLocal = (e) => {
      const rect = c.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
    };

    c.addEventListener("mousedown", e => {
      const p = getLocal(e);
      this.dragging = true;
      this.mouseMoved = false;
      this.lastMouse = { x: p.x, y: p.y };
      this._mouseDownPos = { x: p.x, y: p.y };
    });

    c.addEventListener("mouseup", e => {
      const p = getLocal(e);

      const dx = p.x - (this._mouseDownPos?.x ?? p.x);
      const dy = p.y - (this._mouseDownPos?.y ?? p.y);
      const moved = Math.hypot(dx, dy) > this.dragThreshhold;

      if (!moved) {
        // place a guess marker in world coordinates
        this.guessMarker = this.screenToWorld(p.x, p.y);
      }

      this.dragging = false;
      this._mouseDownPos = null;
    });

    c.addEventListener("mouseleave", () => {
      this.dragging = false;
      this._mouseDownPos = null;
    });

    c.addEventListener("mousemove", e => {
      if (!this.dragging) return;
      const p = getLocal(e);

      const dx = p.x - this.lastMouse.x;
      const dy = p.y - this.lastMouse.y;

      if (this._mouseDownPos) {
        const totalDx = p.x - this._mouseDownPos.x;
        const totalDy = p.y - this._mouseDownPos.y;
        this.mouseMoved = Math.hypot(totalDx, totalDy) > this.dragThreshhold;
      }

      // pan camera
      this.camera.x -= dx / this.camera.zoom;
      this.camera.y -= dy / this.camera.zoom;
      this.lastMouse = { x: p.x, y: p.y };
    });

    c.addEventListener("wheel", e => {
      e.preventDefault();

      const rect = c.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      const worldAtMouse = this.screenToWorld(sx, sy);

      let newTarget = e.deltaY < 0 ? this.camera.targetZoom * this.zoomSpeed : this.camera.targetZoom / this.zoomSpeed;
      newTarget = Math.min(Math.max(newTarget, this.minZoom), this.maxZoom);

      this._zoomAnchor = { sx, sy, wx: worldAtMouse.x, wy: worldAtMouse.y };

      this.camera.targetZoom = newTarget;
    }, { passive: false });
  }

  _resize() {
    // default behavior: full-window
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this._draw();
  }

  _animate() {
    // smooth zoom
    this.camera.zoom += (this.camera.targetZoom - this.camera.zoom) * this.zoomLerpSpeed;

    if (this._zoomAnchor) {
      const { sx, sy, wx, wy } = this._zoomAnchor;
      const cx = this.canvas.width / 2;
      const cy = this.canvas.height / 2;

      // update camera x/y so the world point under the mouse stays under the mouse while zooming
      this.camera.x = wx - (sx - cx) / this.camera.zoom;
      this.camera.y = wy - (sy - cy) / this.camera.zoom;

      if (Math.abs(this.camera.targetZoom - this.camera.zoom) < 1e-3) {
        this._zoomAnchor = null;
        this.camera.zoom = this.camera.targetZoom;
      }
    }

    this._draw();
    requestAnimationFrame(() => this._animate());
  }

  _draw() {
    if (!this.image.complete) return;
    const { ctx, camera, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    const imgW = this.worldSize * camera.zoom;
    const imgH = this.worldSize * camera.zoom;
    const drawX = cx - (camera.x * camera.zoom);
    const drawY = cy - (camera.y * camera.zoom);

    ctx.drawImage(this.image, drawX, drawY, imgW, imgH);

    // draw guess marker (cyan) if present
    if (this.guessMarker) {
      const screen = this.worldToScreen(this.guessMarker.x, this.guessMarker.y);
      ctx.fillStyle = "cyan";
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, 5, 0, Math.PI * 2);
      ctx.fill();
      // border for visibility
      ctx.strokeStyle = "#003333";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // draw actual marker (red) if present
    if (this.actualMarker) {
      const screenA = this.worldToScreen(this.actualMarker.x, this.actualMarker.y);
      ctx.fillStyle = "red";
      ctx.beginPath();
      ctx.arc(screenA.x, screenA.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#440000";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  screenToWorld(sx, sy) {
    const cx = this.canvas.width / 2;
    const cy = this.canvas.height / 2;
    return {
      x: (sx - cx) / this.camera.zoom + this.camera.x,
      y: (sy - cy) / this.camera.zoom + this.camera.y
    };
  }

  worldToScreen(wx, wy) {
    const cx = this.canvas.width / 2;
    const cy = this.canvas.height / 2;
    return {
      x: (wx - this.camera.x) * this.camera.zoom + cx,
      y: (wy - this.camera.y) * this.camera.zoom + cy
    };
  }
}