import { WORLD, ROAD_WIDTH, type Car, type Level, type Mode, type Point, type Tool } from './types';

interface CanvasState {
  level: Level;
  tool: Tool;
  mode: Mode;
  cars: Car[];
  showDemand: boolean;
  selectedPortal: string | null;
}
interface Callbacks {
  onRoad: (points: Point[], bridge: boolean) => void;
  onErase: (roadId: string) => void;
  onPortal: (point: Point) => void;
  onSelectPortal: (id: string) => void;
}
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const near = (a: Point, b: Point, d: number) => distance(a, b) <= d;
const MAP_PADDING = { left: 35, right: 35, top: 65, bottom: 110 };
const TERRAIN_MARGIN = 800;
function projection(p: Point, a: Point, b: Point): Point {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return { x: a.x + t * dx, y: a.y + t * dy };
}
function simplify(points: Point[], tolerance = 2): Point[] {
  if (points.length < 3) return points;
  let maximum = 0, index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = distance(points[i], projection(points[i], points[0], points[points.length - 1]));
    if (d > maximum) { maximum = d; index = i; }
  }
  if (maximum < tolerance) return [points[0], points[points.length - 1]];
  return [...simplify(points.slice(0, index + 1), tolerance).slice(0, -1), ...simplify(points.slice(index), tolerance)];
}

/** A self-contained map view. Coordinates in callbacks use the 1200 × 850 game world. */
export class RoadCanvas {
  private ctx: CanvasRenderingContext2D;
  private state?: CanvasState;
  private callbacks: Callbacks;
  private canvas: HTMLCanvasElement;
  private observer: ResizeObserver;
  private width = 1;
  private height = 1;
  private fit = 1;
  private zoomLevel = 1;
  private pan = { x: 0, y: 0 };
  private drawing: Point[] | null = null;
  private clickStart: Point | null = null;
  private pointer: Point | null = null;
  private snapPoint: Point | null = null;
  private dragging = false;
  private panning: Point | null = null;
  private space = false;
  private frame = 0;
  private downPosition: Point | null = null;
  private terrain: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement, callbacks: Callbacks) {
    this.canvas = canvas;
    this.callbacks = callbacks;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D is unavailable in this browser.');
    this.ctx = context;
    this.terrain = this.makeTerrain();
    canvas.style.touchAction = 'none';
    canvas.setAttribute('aria-label', 'Road map. Drag from a terminal to draw a one-way road. Wheel to zoom.');
    canvas.tabIndex = 0;
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(canvas);
    canvas.addEventListener('pointerdown', this.pointerDown);
    canvas.addEventListener('pointermove', this.pointerMove);
    canvas.addEventListener('pointerup', this.pointerUp);
    canvas.addEventListener('pointercancel', this.cancel);
    canvas.addEventListener('pointerleave', this.leave);
    canvas.addEventListener('wheel', this.wheel, { passive: false });
    canvas.addEventListener('contextmenu', this.contextMenu);
    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('keyup', this.keyUp);
    window.addEventListener('blur', this.blur);
    this.resize();
    this.frame = requestAnimationFrame(this.render);
  }

  setState(state: CanvasState) {
    if (this.state && (state.tool !== this.state.tool || state.mode !== this.state.mode || state.level.id !== this.state.level.id)) {
      this.drawing = null;
      this.clickStart = null;
    }
    this.state = state;
    this.updateCursor();
  }

  zoom(delta: number) {
    this.zoomLevel = Math.max(0.65, Math.min(3.5, this.zoomLevel * (delta > 0 ? 1.2 : 1 / 1.2)));
  }

  resetView() {
    this.zoomLevel = 1;
    this.pan = { x: 0, y: 0 };
  }

  destroy() {
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    this.canvas.removeEventListener('pointerdown', this.pointerDown);
    this.canvas.removeEventListener('pointermove', this.pointerMove);
    this.canvas.removeEventListener('pointerup', this.pointerUp);
    this.canvas.removeEventListener('pointercancel', this.cancel);
    this.canvas.removeEventListener('pointerleave', this.leave);
    this.canvas.removeEventListener('wheel', this.wheel);
    this.canvas.removeEventListener('contextmenu', this.contextMenu);
    window.removeEventListener('keydown', this.keyDown);
    window.removeEventListener('keyup', this.keyUp);
    window.removeEventListener('blur', this.blur);
  }

  private resize = () => {
    const box = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, box.width);
    this.height = Math.max(1, box.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.fit = Math.min(
      Math.max(1, this.width - MAP_PADDING.left - MAP_PADDING.right) / WORLD.width,
      Math.max(1, this.height - MAP_PADDING.top - MAP_PADDING.bottom) / WORLD.height,
    );
  };

  private transform() {
    const scale = this.fit * this.zoomLevel;
    return {
      scale,
      x: MAP_PADDING.left + (this.width - MAP_PADDING.left - MAP_PADDING.right - WORLD.width * scale) / 2 + this.pan.x,
      y: MAP_PADDING.top + (this.height - MAP_PADDING.top - MAP_PADDING.bottom - WORLD.height * scale) / 2 + this.pan.y,
    };
  }

  private local(e: PointerEvent | WheelEvent): Point {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private toWorld(point: Point): Point {
    const t = this.transform();
    return { x: Math.max(20, Math.min(WORLD.width - 20, (point.x - t.x) / t.scale)), y: Math.max(20, Math.min(WORLD.height - 20, (point.y - t.y) / t.scale)) };
  }

  private snap(point: Point): Point {
    if (!this.state) return point;
    const portal = this.state.level.portals.find(p => near(p, point, 30));
    if (portal) return { x: portal.x, y: portal.y };
    let best = 22, result = point;
    for (const road of this.state.level.roads) {
      if (road.bridge) {
        for (const p of [road.points[0], road.points[road.points.length - 1]]) {
          if (!p) continue;
          const d = distance(point, p);
          if (d < best) { best = d; result = { x: p.x, y: p.y }; }
        }
        continue;
      }
      for (let i = 1; i < road.points.length; i++) {
        const p = projection(point, road.points[i - 1], road.points[i]);
        const d = distance(point, p);
        if (d < best) { best = d; result = p; }
      }
    }
    return result;
  }

  private closestRoad(p: Point) {
    let result: string | null = null, best = 24;
    for (const road of this.state?.level.roads ?? []) {
      for (let i = 1; i < road.points.length; i++) {
        const d = distance(p, projection(p, road.points[i - 1], road.points[i]));
        if (d < best) { best = d; result = road.id; }
      }
    }
    return result;
  }

  private pointerDown = (e: PointerEvent) => {
    if (!this.state || (e.button !== 0 && e.button !== 1)) return;
    this.canvas.focus({ preventScroll: true });
    this.canvas.setPointerCapture(e.pointerId);
    if (this.space || e.button === 1) { this.panning = this.local(e); this.updateCursor(); return; }
    const point = this.toWorld(this.local(e));
    if (this.state.tool === 'erase') {
      const road = this.closestRoad(point);
      if (road) this.callbacks.onErase(road);
      return;
    }
    if (this.state.tool === 'portal' && this.state.mode === 'build') {
      const portal = this.state.level.portals.find(p => near(p, point, 34));
      if (portal) this.callbacks.onSelectPortal(portal.id);
      else this.callbacks.onPortal(point);
      return;
    }
    if (this.state.tool === 'select') {
      const portal = this.state.level.portals.find(p => near(p, point, 34));
      if (portal) this.callbacks.onSelectPortal(portal.id);
      return;
    }
    if (this.state.tool === 'road' || this.state.tool === 'bridge') {
      const snapped = this.snap(point);
      this.downPosition = point;
      this.dragging = false;
      if (this.clickStart) {
        if (distance(this.clickStart, snapped) > 12) this.callbacks.onRoad([this.clickStart, snapped], this.state.tool === 'bridge');
        this.clickStart = null;
        this.drawing = null;
        this.downPosition = null;
      } else this.drawing = [snapped];
    }
  };

  private pointerMove = (e: PointerEvent) => {
    const screen = this.local(e);
    if (this.panning) {
      this.pan.x += screen.x - this.panning.x;
      this.pan.y += screen.y - this.panning.y;
      this.panning = screen;
      return;
    }
    this.pointer = this.toWorld(screen);
    const snapped = this.snap(this.pointer);
    this.snapPoint = distance(this.pointer, snapped) > 0.1 ? snapped : null;
    if (this.drawing && this.downPosition) {
      if (distance(this.pointer, this.downPosition) > 5) this.dragging = true;
      const last = this.drawing[this.drawing.length - 1];
      if (distance(last, this.pointer) > 3) this.drawing.push(this.pointer);
    }
    if (e.buttons === 1 && this.state?.tool === 'erase') {
      const road = this.closestRoad(this.pointer);
      if (road) this.callbacks.onErase(road);
    }
  };

  private pointerUp = (e: PointerEvent) => {
    if (this.panning) { this.panning = null; this.updateCursor(); return; }
    if (!this.drawing || !this.state) return;
    const end = this.snap(this.toWorld(this.local(e)));
    if (this.dragging) {
      const points = simplify([...this.drawing, end]);
      const length = points.reduce((sum, p, i) => sum + (i ? distance(p, points[i - 1]) : 0), 0);
      if (length > 12) this.callbacks.onRoad(points, this.state.tool === 'bridge');
      this.clickStart = null;
    } else this.clickStart = this.drawing[0];
    this.drawing = null;
    this.downPosition = null;
    this.dragging = false;
  };

  private cancel = () => { this.drawing = null; this.clickStart = null; this.downPosition = null; this.panning = null; this.updateCursor(); };
  private leave = () => { if (!this.drawing && !this.panning) { this.pointer = null; this.snapPoint = null; } };
  private contextMenu = (e: MouseEvent) => { e.preventDefault(); this.cancel(); };
  private wheel = (e: WheelEvent) => {
    e.preventDefault();
    const local = this.local(e);
    const old = this.transform();
    const wx = (local.x - old.x) / old.scale, wy = (local.y - old.y) / old.scale;
    this.zoomLevel = Math.max(0.65, Math.min(3.5, this.zoomLevel * Math.exp(-e.deltaY * 0.001)));
    const next = this.transform();
    this.pan.x += local.x - (wx * next.scale + next.x);
    this.pan.y += local.y - (wy * next.scale + next.y);
  };
  private keyDown = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).matches('input, textarea, select, [contenteditable]')) return;
    if (e.code === 'Space') { this.space = true; this.updateCursor(); if (document.activeElement === this.canvas) e.preventDefault(); }
    if (e.key === 'Escape') this.cancel();
  };
  private keyUp = (e: KeyboardEvent) => { if (e.code === 'Space') { this.space = false; this.updateCursor(); } };
  private blur = () => { this.space = false; this.cancel(); };
  private updateCursor() {
    this.canvas.style.cursor = this.panning ? 'grabbing' : this.space ? 'grab' : this.state?.tool === 'select' ? 'pointer' : 'crosshair';
  }

  private path(points: Point[]) {
    const c = this.ctx;
    c.beginPath();
    points.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y));
  }

  private render = () => {
    const c = this.ctx;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, this.width, this.height);
    c.fillStyle = '#c5d0b8';
    c.fillRect(0, 0, this.width, this.height);
    const t = this.transform();
    c.translate(t.x, t.y);
    c.scale(t.scale, t.scale);
    c.drawImage(this.terrain, -TERRAIN_MARGIN, -TERRAIN_MARGIN);
    if (this.state) {
      const { level } = this.state;
      if (this.state.showDemand) this.drawDemand();
      for (const bridge of [false, true]) {
        for (const road of level.roads) {
          if (road.bridge !== bridge || road.points.length < 2) continue;
          const eraseHover = this.state.tool === 'erase' && this.pointer && this.closestRoad(this.pointer) === road.id;
          c.lineJoin = 'round'; c.lineCap = 'round';
          if (bridge) {
            c.save(); c.translate(2, 7); c.strokeStyle = '#4e5c3e32'; c.lineWidth = ROAD_WIDTH + 8;
            this.path(road.points); c.stroke(); c.restore();
          }
          this.path(road.points); c.strokeStyle = eraseHover ? '#bc6559' : bridge ? '#77796a' : '#8d957d'; c.lineWidth = ROAD_WIDTH + (bridge ? 5 : 3); c.stroke();
          this.path(road.points); c.strokeStyle = eraseHover ? '#e8aaa0' : '#f5f0df'; c.lineWidth = ROAD_WIDTH; c.stroke();
          if (bridge) {
            this.path(road.points); c.strokeStyle = '#ffffff30'; c.lineWidth = ROAD_WIDTH - 3; c.stroke();
          }
          this.drawRoadArrows(road.points);
        }
      }
      for (const car of this.state.cars) {
        c.save(); c.translate(car.position.x, car.position.y); c.rotate(car.angle);
        c.shadowColor = '#26382b44'; c.shadowBlur = 3; c.shadowOffsetY = 1.5;
        c.fillStyle = car.color; c.strokeStyle = '#ffffff80'; c.lineWidth = .7;
        c.beginPath(); c.roundRect(-5, -2.7, 10, 5.4, 1.6); c.fill(); c.stroke();
        c.shadowColor = 'transparent'; c.fillStyle = '#f6f4e7a0'; c.fillRect(1.4, -1.7, 1.6, 3.4);
        c.restore();
      }
      if (this.drawing && this.drawing.length) this.drawPreview([...this.drawing, this.snapPoint ?? this.pointer ?? this.drawing[0]]);
      else if (this.clickStart && this.pointer) this.drawPreview([this.clickStart, this.snapPoint ?? this.pointer]);
      this.drawPortals();
      if (this.pointer && this.state.tool === 'portal' && this.state.mode === 'build') {
        c.save(); c.strokeStyle = '#45533b80'; c.lineWidth = 1.5; c.setLineDash([4, 4]); c.beginPath(); c.arc(this.pointer.x, this.pointer.y, 22, 0, Math.PI * 2); c.stroke(); c.restore();
      }
      if (this.snapPoint && (this.state.tool === 'road' || this.state.tool === 'bridge')) {
        c.strokeStyle = '#fbf9ec'; c.fillStyle = '#5e7151'; c.lineWidth = 2;
        c.beginPath(); c.arc(this.snapPoint.x, this.snapPoint.y, 5, 0, Math.PI * 2); c.fill(); c.stroke();
      }
    }
    this.frame = requestAnimationFrame(this.render);
  };

  private drawPreview(points: Point[]) {
    const c = this.ctx;
    c.save(); c.lineJoin = 'round'; c.lineCap = 'round';
    this.path(points); c.strokeStyle = '#475d4580'; c.lineWidth = ROAD_WIDTH + 4; c.stroke();
    this.path(points); c.strokeStyle = '#fffbed'; c.lineWidth = ROAD_WIDTH; c.setLineDash([10, 5]); c.stroke();
    c.restore(); this.drawRoadArrows(points);
  }

  private drawRoadArrows(points: Point[]) {
    const c = this.ctx;
    let carry = 40;
    c.save(); c.strokeStyle = '#999c8a'; c.lineWidth = 1.3;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i], length = distance(a, b);
      for (let d = carry; d < length; d += 80) {
        const p = { x: a.x + (b.x - a.x) * d / length, y: a.y + (b.y - a.y) * d / length };
        c.save(); c.translate(p.x, p.y); c.rotate(Math.atan2(b.y - a.y, b.x - a.x));
        c.beginPath(); c.moveTo(-3, -2.1); c.lineTo(0, 0); c.lineTo(-3, 2.1); c.stroke(); c.restore();
      }
      carry = (carry - length) % 80; if (carry < 0) carry += 80;
    }
    c.restore();
  }

  private drawDemand() {
    if (!this.state) return;
    const c = this.ctx, { level } = this.state;
    for (const demand of level.demands) {
      const a = level.portals.find(p => p.id === demand.from), b = level.portals.find(p => p.id === demand.to);
      if (!a || !b || demand.rate <= 0) continue;
      const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy) || 1;
      const bend = Math.min(70, length * .15);
      const mid = { x: (a.x + b.x) / 2 - dy / length * bend, y: (a.y + b.y) / 2 + dx / length * bend };
      c.save(); c.globalAlpha = .62; c.strokeStyle = a.color; c.lineWidth = 2; c.setLineDash([5, 7]);
      c.beginPath(); c.moveTo(a.x, a.y); c.quadraticCurveTo(mid.x, mid.y, b.x, b.y); c.stroke(); c.setLineDash([]);
      const pos = { x: .25 * a.x + .5 * mid.x + .25 * b.x, y: .25 * a.y + .5 * mid.y + .25 * b.y };
      c.globalAlpha = 1; c.fillStyle = '#f0f1e5';
      c.beginPath(); c.roundRect(pos.x - 21, pos.y - 10, 42, 20, 10); c.fill();
      c.fillStyle = '#5a6553'; c.font = '600 10px "Arial", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(demand.rate), pos.x, pos.y + .5);
      const f = .79, u = 1 - f;
      const arrow = { x: u * u * a.x + 2 * u * f * mid.x + f * f * b.x, y: u * u * a.y + 2 * u * f * mid.y + f * f * b.y };
      c.translate(arrow.x, arrow.y); c.rotate(Math.atan2(2 * u * (mid.y - a.y) + 2 * f * (b.y - mid.y), 2 * u * (mid.x - a.x) + 2 * f * (b.x - mid.x)));
      c.fillStyle = a.color; c.beginPath(); c.moveTo(5, 0); c.lineTo(-4, -4); c.lineTo(-4, 4); c.closePath(); c.fill();
      c.restore();
    }
  }

  private drawPortals() {
    if (!this.state) return;
    const c = this.ctx;
    for (const [i, portal] of this.state.level.portals.entries()) {
      const selected = portal.id === this.state.selectedPortal;
      c.save(); c.translate(portal.x, portal.y);
      c.shadowColor = '#354b3520'; c.shadowOffsetY = 4; c.shadowBlur = 8;
      c.fillStyle = '#f5f2e6'; c.beginPath(); c.arc(0, 0, 27, 0, Math.PI * 2); c.fill();
      c.shadowColor = 'transparent';
      c.strokeStyle = selected ? '#46583b' : '#f5f2e690'; c.lineWidth = selected ? 2 : 1;
      c.beginPath(); c.arc(0, 0, 31, 0, Math.PI * 2); c.stroke();
      c.fillStyle = portal.color; c.beginPath(); c.arc(0, 0, 20, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#fffdf3'; c.font = '600 17px "Arial", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(String.fromCharCode(65 + i), 0, 1);
      c.font = '600 12px "Arial", sans-serif';
      const w = c.measureText(portal.name).width + 20;
      c.fillStyle = '#f4f1e8e8'; c.beginPath(); c.roundRect(-w / 2, 40, w, 25, 5); c.fill();
      c.fillStyle = '#48523f'; c.fillText(portal.name, 0, 53);
      c.restore();
    }
  }

  private makeTerrain() {
    const canvas = document.createElement('canvas');
    canvas.width = WORLD.width + TERRAIN_MARGIN * 2;
    canvas.height = WORLD.height + TERRAIN_MARGIN * 2;
    const c = canvas.getContext('2d')!;
    c.fillStyle = '#c5d0b8'; c.fillRect(0, 0, canvas.width, canvas.height);
    c.translate(TERRAIN_MARGIN, TERRAIN_MARGIN);
    // Open pasture, woodland, and quiet topographic contours, generated locally.
    c.fillStyle = '#bdcaae'; c.beginPath(); c.moveTo(-800, -800); c.lineTo(446, -800); c.bezierCurveTo(470, 80, 255, 125, 345, 210); c.bezierCurveTo(420, 310, 175, 285, 148, 402); c.lineTo(-800, 470); c.closePath(); c.fill();
    c.fillStyle = '#b8c5a9'; c.beginPath(); c.moveTo(2000, 530); c.bezierCurveTo(950, 510, 1090, 670, 870, 780); c.lineTo(835, 1650); c.lineTo(2000, 1650); c.closePath(); c.fill();
    c.strokeStyle = '#a6b69740'; c.lineWidth = 1;
    for (let i = 0; i < 9; i++) {
      c.beginPath();
      c.ellipse(34, 48, 97 + i * 35, 58 + i * 27, -.35, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.ellipse(1180, 790, 114 + i * 34, 66 + i * 26, -.55, 0, Math.PI * 2); c.stroke();
    }
    // A decorative stream. Drawing roads over it is allowed.
    const river = () => {
      c.beginPath(); c.moveTo(742, -850); c.bezierCurveTo(663, 76, 858, 151, 777, 268); c.bezierCurveTo(713, 358, 690, 390, 742, 479); c.bezierCurveTo(805, 581, 674, 648, 728, 744); c.bezierCurveTo(756, 793, 791, 812, 781, 1700);
    };
    c.lineCap = 'round'; river(); c.strokeStyle = '#9ebba873'; c.lineWidth = 47; c.stroke();
    river(); c.strokeStyle = '#a3bfba'; c.lineWidth = 33; c.stroke();
    river(); c.strokeStyle = '#b4ccc5'; c.lineWidth = 24; c.stroke();
    c.strokeStyle = '#d3ded233'; c.lineWidth = 1;
    for (let i = 0; i < 19; i++) {
      c.beginPath(); c.moveTo(706 + Math.sin(i * 1.2) * 34, i * 48 + 8); c.lineTo(723 + Math.sin(i * 1.2) * 34, i * 48 + 8); c.stroke();
    }
    let seed = 482;
    const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const clusters = [{ x: 75, y: 187, r: 120 }, { x: 1100, y: 110, r: 90 }, { x: 1117, y: 700, r: 140 }, { x: 310, y: 760, r: 90 }, { x: 495, y: 420, r: 35 }];
    for (const cluster of clusters) {
      for (let i = 0; i < 24; i++) {
        const theta = random() * Math.PI * 2, r = Math.sqrt(random()) * cluster.r;
        const x = cluster.x + Math.cos(theta) * r, y = cluster.y + Math.sin(theta) * r;
        const radius = 3 + random() * 7;
        c.fillStyle = '#82987223'; c.beginPath(); c.ellipse(x + 3, y + 4, radius + 1, radius * .6, -.5, 0, Math.PI * 2); c.fill();
        c.fillStyle = ['#96ac85', '#a1b48e', '#8fa77e', '#aaba97'][Math.floor(random() * 4)];
        c.beginPath(); c.arc(x, y, radius, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#d5dfbf35'; c.beginPath(); c.arc(x - 2, y - 2, radius * .55, 0, Math.PI * 2); c.fill();
      }
    }
    // Fine irregular grain makes large empty regions feel like paper.
    c.fillStyle = '#53694713';
    for (let i = 0; i < 16000; i++) c.fillRect(random() * WORLD.width, random() * WORLD.height, .65, .65);
    c.fillStyle = '#6f825d70'; c.font = '10px "Arial", sans-serif'; c.textAlign = 'center';
    c.save(); c.translate(729, 515); c.rotate(-1.1); c.fillText('W I L L O W  C R E E K', 0, 0); c.restore();
    c.fillStyle = '#6f825d65'; c.font = '9px "Arial", sans-serif'; c.fillText('N O R T H  M E A D O W', 421, 100); c.fillText('T H E  L O W L A N D S', 470, 775);
    return canvas;
  }
}
