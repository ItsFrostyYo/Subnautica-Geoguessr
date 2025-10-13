export class GameMap {
  constructor(canvas, options = {}) {
  this.canvas = canvas;
  this.ctx = canvas.getContext("2d");

  // standard options
  this.worldMin = options.worldMin ?? -2048;
  this.worldMax = options.worldMax ??  2048;
  this.worldSize = this.worldMax - this.worldMin;
  this.zoomSpeed = options.zoomSpeed || 1.1;
  this.zoomLerpSpeed = options.zoomLerpSpeed || 0.15;
  this.minZoom = options.minZoom || 0.25;
  this.maxZoom = options.maxZoom || 8;
  this.dragThreshhold = options.dragThreshhold || 4;

  this.region = options.region ?? {
    minX: this.worldMin,
    maxX: this.worldMax,
    minY: this.worldMin,
    maxY: this.worldMax
  };

  this. IMAGES = {
        main: './map_main.webp',
        lost_river: './map_lost_river.png',
        inactive_lavazone: './map_inactive_lavazone.png',
        lava_lakes: './map_lava_lakes.png',
        jellyshroom: './map_jellyshroom.png'
  };

  // camera
  this.camera = {
    x: (this.worldMin + this.worldMax) / 2,
    y: (this.worldMin + this.worldMax) / 2,
    zoom: 1,
    targetZoom: 1
  };

  // markers/state
  this.guessMarker = null;
  this.actualMarker = null;
  this.drawActualMarker = false;
  this.drawLine = false;

  this.dragging = false;
  this.lastMouse = { x: 0, y: 0 };
  this.mouseMoved = false;

  this.image = new Image();
  this.imageFailed = false;
  this._started = false;

  const startAnimate = () => { this._resize(); this._animate(); };

  this.image.onload = () => {
    this.imageFailed = false;
    if (!this._started) {
      this._started = true;
      startAnimate();
    } else {
      this._draw();
    }
  };

  this.image.onerror = () => {
    console.error('Failed to load map image:', this.image.src);
    this.imageFailed = true;
    if (!this._started) {
      this._started = true;
      startAnimate();
    } else {
      this._draw();
    }
  };

  this.image.src = options.imageSrc || "map_main.webp";

  // events
  this._setupEvents();
  window.addEventListener("resize", () => this._resize());
}

_setupEvents() {
  const c = this.canvas;

  const getLocal = (e) => {
  const rect = c.getBoundingClientRect();
  const scaleX = this.canvas.width  / rect.width;
  const scaleY = this.canvas.height / rect.height;
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top)  * scaleY
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

    this.camera.x -= dx / this.camera.zoom;
    this.camera.y += dy / this.camera.zoom;
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
  const rect = this.canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  this.canvas.width  = Math.max(1, Math.round(rect.width  * dpr));
  this.canvas.height = Math.max(1, Math.round(rect.height * dpr));

  this._fitRegionToCanvas('cover');

  this._draw();
}

  _animate() {
  const now = performance.now();

  if (this._flight) {
    const f = this._flight;
    const t = Math.min(1, (now - f.startTime) / f.durationMs);
    const k = this._blendEase(t, f.easeLinearity);

    this.camera.x = f.startX + (f.endX - f.startX) * k;
    this.camera.y = f.startY + (f.endY - f.startY) * k;
    this.camera.zoom = f.startZ + (f.endZ - f.startZ) * k;

    if (t >= 1) {
      this._flight = null;
      this.camera.zoom = f.endZ;
      this.camera.targetZoom = f.endZ;
    }
  } else {
    this.camera.zoom += (this.camera.targetZoom - this.camera.zoom) * this.zoomLerpSpeed;

    if (this._zoomAnchor) {
      const { sx, sy, wx, wy } = this._zoomAnchor;
      const cx = this.canvas.width / 2;
      const cy = this.canvas.height / 2;

      this.camera.x = wx - (sx - cx) / this.camera.zoom;
      this.camera.y = wy + (sy - cy) / this.camera.zoom;

      if (Math.abs(this.camera.targetZoom - this.camera.zoom) < 1e-3) {
        this._zoomAnchor = null;
        this.camera.zoom = this.camera.targetZoom;
      }
    }
  }

  this._draw();
  requestAnimationFrame(() => this._animate());
}

  _draw() {
  if (!this.image || !this.image.complete || this.image.naturalWidth === 0) return;

  const ctx = this.ctx;
  const canvas = this.canvas;
  const camera = this.camera; 
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const cx = canvas.width / 2;
  const cy = canvas.height / 2;

  const imgW = this.worldSize * camera.zoom;
  const imgH = this.worldSize * camera.zoom;

  const drawX = cx - ((camera.x - this.worldMin) * camera.zoom);
  const drawY = cy - ((this.worldMax - camera.y) * camera.zoom);

  ctx.drawImage(this.image, drawX, drawY, imgW, imgH);

  if (this.guessMarker && this.actualMarker && this.drawLine == true) {
    const g = this.worldToScreen(this.guessMarker.x, this.guessMarker.y);
    const a = this.worldToScreen(this.actualMarker.x, this.actualMarker.y);

    ctx.strokeStyle = "black";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(g.x, g.y);
    ctx.lineTo(a.x, a.y);
    ctx.stroke();
  }

    if (this.guessMarker) {
      const { x, y } = this.guessMarker;
      if (Math.max(Math.abs(x), Math.abs(y)) <= 2048) { 
        const screen = this.worldToScreen(x, y);
        ctx.fillStyle = "red"; ctx.beginPath();
        ctx.arc(screen.x, screen.y, 5, 0, Math.PI * 2);
        ctx.fill(); 
      } 
    }

    if (this.actualMarker && this.drawActualMarker) {
      const s = this.worldToScreen(this.actualMarker.x, this.actualMarker.y);

      this.ctx.fillStyle = "limegreen";
      this.ctx.beginPath();
      this.ctx.arc(s.x, s.y, 6, 0, Math.PI * 2);
      this.ctx.fill();

      // outline
      this.ctx.strokeStyle = "white";
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.arc(s.x, s.y, 6, 0, Math.PI * 2);
      this.ctx.stroke();
    }
  }

  _fitRegionToCanvas(mode = 'cover') {
  const { minX, maxX, minY, maxY } = this.region ?? {
    minX: this.worldMin, maxX: this.worldMax,
    minY: this.worldMin, maxY: this.worldMax
  };

  const regionW = (maxX - minX);
  const regionH = (maxY - minY);

  const cw = this.canvas.width;
  const ch = this.canvas.height;

  const zoomX = cw / regionW;
  const zoomY = ch / regionH;
  const fitZoom = (mode === 'contain') ? Math.min(zoomX, zoomY) : Math.max(zoomX, zoomY);

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  this.camera.x = cx;
  this.camera.y = cy;
  this.camera.zoom = this.camera.targetZoom = Math.min(Math.max(fitZoom, this.minZoom), this.maxZoom);
}

  setActualMarker(x, y){
    this.actualMarker = {x, y};
  }

  clearActualMarker() {
    this.actualMarker = null;
  }

  clearGuessMarker() {
    this.guessMarker = null;
  }

  screenToWorld(sx, sy) {
  const cx = this.canvas.width / 2;
  const cy = this.canvas.height / 2;
  return {
    x: (sx - cx) / this.camera.zoom + this.camera.x,
    y:  this.camera.y - (sy - cy) / this.camera.zoom
  };
}

setMap({ imageSrc, region, recenter = true }) {
  if (region) this.region = { ...region };
  if (recenter) {
    const cx = (this.region.minX + this.region.maxX) / 2;
    const cy = (this.region.minY + this.region.maxY) / 2;
    this.camera.x = cx;
    this.camera.y = cy;
    this.camera.targetZoom = this.camera.zoom;
  }
  if (imageSrc && imageSrc !== this.image.src) {
    this.imageFailed = false;
    this.image = new Image();
    this.image.onload = () => { this.imageFailed = false; };
    this.image.onerror = () => { console.error('Failed to load map image:', imageSrc); this.imageFailed = true; };
    this.image.src = imageSrc;
  }
  if (recenter) this._fitRegionToCanvas('cover');
}

worldToScreen(wx, wy) {
  const cx = this.canvas.width / 2;
  const cy = this.canvas.height / 2;
  return {
    x: (wx - this.camera.x) * this.camera.zoom + cx,
    y: (this.camera.y - wy) * this.camera.zoom + cy
  };
}

_easeInOutCubic(t) { return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2; }
_blendEase(t, easeLinearity) {
  return (1 - easeLinearity) * t + easeLinearity * this._easeInOutCubic(t);
}

flyToWorld(x, y, zoom = null, options = {}) {
  const duration = Math.max(0.01, options.duration ?? 0.5); // seconds
  const easeLinearity = Math.min(1, Math.max(0, options.easeLinearity ?? 0.25));

  const start = {
    x: this.camera.x,
    y: this.camera.y,
    zoom: this.camera.zoom
  };

  const endZoom = (zoom == null)
    ? this.camera.zoom
    : Math.min(Math.max(zoom, this.minZoom), this.maxZoom);

  this._flight = {
    startX: start.x,
    startY: start.y,
    startZ: start.zoom,
    endX: x,
    endY: y,
    endZ: endZoom,
    startTime: performance.now(),
    durationMs: duration * 1000,
    easeLinearity
  };

  // prevent the usual zoom lerp from fighting the flight
  this.camera.targetZoom = endZoom;
}

flyTo(latlngOrPoint, zoom = null, options = {}) {
  if (Array.isArray(latlngOrPoint) && latlngOrPoint.length >= 2) {
    const [y, x] = latlngOrPoint;
    this.flyToWorld(x, y, zoom, options);
  } else if (latlngOrPoint && typeof latlngOrPoint === 'object') {
    const { x, y } = latlngOrPoint;
    this.flyToWorld(x, y, zoom, options);
  } else {
    throw new Error("flyTo expects [y, x] or {x, y}");
  }
}
}