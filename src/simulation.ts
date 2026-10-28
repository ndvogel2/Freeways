import type { Car, Level, Point, SimulationStats } from './types';

const SNAP = 28;
const EPS = 1e-6;
const SPEED = 64;
const GAP = 17;
const MAX_CARS = 600;
const MAX_PENDING = 120;
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const lerp = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
interface Marker { t: number; node: number }
interface Segment { a: Point; b: Point; road: number; layer: string; bridge: boolean; first: boolean; last: boolean; markers: Marker[] }
interface Edge { to: number; cost: number; layer: string }
interface Route { points: Point[]; layers: string[]; cumulative: number[]; length: number }
interface Network { routes: Map<string, Route>; connected: number; total: number }

class MinHeap {
  private items: Array<{ node: number; cost: number }> = [];
  get length() { return this.items.length; }
  push(entry: { node: number; cost: number }) {
    let i = this.items.length; this.items.push(entry);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.items[parent].cost <= entry.cost) break;
      this.items[i] = this.items[parent]; i = parent;
    }
    this.items[i] = entry;
  }
  pop() {
    const first = this.items[0], last = this.items.pop()!;
    if (this.items.length) {
      let i = 0;
      while (i * 2 + 1 < this.items.length) {
        let child = i * 2 + 1;
        if (child + 1 < this.items.length && this.items[child + 1].cost < this.items[child].cost) child++;
        if (this.items[child].cost >= last.cost) break;
        this.items[i] = this.items[child]; i = child;
      }
      this.items[i] = last;
    }
    return first;
  }
}

function project(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return { t, point: lerp(a, b, t) };
}

/** Directed roads are split at ground intersections. Bridge interiors stay on their own layer. */
function buildNetwork(level: Level): Network {
  const positions: Point[] = [];
  const parents: number[] = [];
  const create = (p: Point) => { const n = positions.length; positions.push({ x: p.x, y: p.y }); parents.push(n); return n; };
  const root = (n: number): number => { while (parents[n] !== n) { parents[n] = parents[parents[n]]; n = parents[n]; } return n; };
  const join = (preferred: number, other: number) => { parents[root(other)] = root(preferred); };
  const segments: Segment[] = [];
  level.roads.forEach((road, roadIndex) => {
    const nodes = road.points.map(create);
    for (let i = 1; i < road.points.length; i++) {
      if (distance(road.points[i - 1], road.points[i]) < EPS) continue;
      segments.push({ a: road.points[i - 1], b: road.points[i], road: roadIndex,
        layer: road.bridge ? road.id : 'ground', bridge: road.bridge, first: i === 1,
        last: i === road.points.length - 1,
        markers: [{ t: 0, node: nodes[i - 1] }, { t: 1, node: nodes[i] }] });
    }
  });
  const mark = (s: Segment, t: number) => {
    const existing = s.markers.find(m => Math.abs(m.t - t) < EPS);
    if (existing) return existing.node;
    const node = create(lerp(s.a, s.b, t)); s.markers.push({ t, node }); return node;
  };
  const roadEnd = (s: Segment, t: number) => (s.first && t < EPS) || (s.last && t > 1 - EPS);
  // Nearby-segment buckets avoid comparing every pair of points in long freehand roads.
  const buckets = new Map<string, number[]>(), CELL = 100;
  const bounds = (s: Segment) => ({ minX: Math.min(s.a.x, s.b.x), maxX: Math.max(s.a.x, s.b.x), minY: Math.min(s.a.y, s.b.y), maxY: Math.max(s.a.y, s.b.y) });
  const segmentBounds = segments.map(bounds);
  segmentBounds.forEach((b, index) => {
    for (let x = Math.floor(b.minX / CELL); x <= Math.floor(b.maxX / CELL); x++) {
      for (let y = Math.floor(b.minY / CELL); y <= Math.floor(b.maxY / CELL); y++) {
        const key = `${x},${y}`, list = buckets.get(key) ?? []; list.push(index); buckets.set(key, list);
      }
    }
  });
  const candidates = (b: { minX: number; maxX: number; minY: number; maxY: number }) => {
    const result = new Set<number>();
    for (let x = Math.floor(b.minX / CELL); x <= Math.floor(b.maxX / CELL); x++) {
      for (let y = Math.floor(b.minY / CELL); y <= Math.floor(b.maxY / CELL); y++) {
        for (const index of buckets.get(`${x},${y}`) ?? []) result.add(index);
      }
    }
    return result;
  };
  const nearPoint = (p: Point) => candidates({ minX: p.x - SNAP, maxX: p.x + SNAP, minY: p.y - SNAP, maxY: p.y + SNAP });
  for (let i = 0; i < segments.length; i++) {
    const a = segments[i];
    for (const j of candidates(segmentBounds[i])) {
      if (j <= i) continue;
      const b = segments[j];
      const ab = segmentBounds[i], bb = segmentBounds[j];
      if (ab.maxX < bb.minX || ab.minX > bb.maxX || ab.maxY < bb.minY || ab.minY > bb.maxY) continue;
      const ax = a.b.x - a.a.x, ay = a.b.y - a.a.y;
      const bx = b.b.x - b.a.x, by = b.b.y - b.a.y;
      const det = ax * by - ay * bx;
      if (Math.abs(det) < EPS) continue;
      const dx = b.a.x - a.a.x, dy = b.a.y - a.a.y;
      const ta = (dx * by - dy * bx) / det, tb = (dx * ay - dy * ax) / det;
      if (ta < -EPS || ta > 1 + EPS || tb < -EPS || tb > 1 + EPS) continue;
      if ((a.bridge && !roadEnd(a, ta)) || (b.bridge && !roadEnd(b, tb))) continue;
      join(mark(a, Math.max(0, Math.min(1, ta))), mark(b, Math.max(0, Math.min(1, tb))));
    }
  }
  // Only road ends snap: passing parallel roads do not accidentally merge.
  for (const a of segments) for (const t of [0, 1]) {
    if (!roadEnd(a, t)) continue;
    const endpoint = t === 0 ? a.a : a.b;
    let best: { s: Segment; t: number; d: number } | undefined;
    for (const index of nearPoint(endpoint)) {
      const b = segments[index];
      if (a.road === b.road) continue;
      const p = project(endpoint, b.a, b.b), d = distance(endpoint, p.point);
      if (d > SNAP || (b.bridge && !roadEnd(b, p.t))) continue;
      if (!best || d < best.d) best = { s: b, t: p.t, d };
    }
    if (best) join(mark(best.s, best.t), mark(a, t));
  }
  const portals = new Map<string, number>();
  for (const portal of level.portals) {
    const n = create(portal); portals.set(portal.id, n);
    for (const index of nearPoint(portal)) {
      const s = segments[index];
      const p = project(portal, s.a, s.b);
      if (distance(portal, p.point) <= SNAP && (!s.bridge || roadEnd(s, p.t))) join(n, mark(s, p.t));
    }
  }
  const graph = new Map<number, Edge[]>();
  for (const s of segments) {
    s.markers.sort((a, b) => a.t - b.t);
    for (let i = 1; i < s.markers.length; i++) {
      const from = root(s.markers[i - 1].node), to = root(s.markers[i].node);
      if (from === to) continue;
      const edges = graph.get(from) ?? [];
      edges.push({ to, cost: distance(positions[from], positions[to]), layer: s.layer }); graph.set(from, edges);
    }
  }
  const routes = new Map<string, Route>();
  const searches = new Map<number, { costs: Map<number, number>; previous: Map<number, { node: number; layer: string }> }>();
  const shortest = (start: number) => {
    const existing = searches.get(start);
    if (existing) return existing;
    const costs = new Map<number, number>([[start, 0]]);
    const previous = new Map<number, { node: number; layer: string }>();
    const queue = new MinHeap(); queue.push({ node: start, cost: 0 });
    while (queue.length) {
      const current = queue.pop();
      if (current.cost !== costs.get(current.node)) continue;
      for (const edge of graph.get(current.node) ?? []) {
        const cost = current.cost + edge.cost;
        if (cost < (costs.get(edge.to) ?? Infinity)) {
          costs.set(edge.to, cost); previous.set(edge.to, { node: current.node, layer: edge.layer }); queue.push({ node: edge.to, cost });
        }
      }
    }
    const result = { costs, previous }; searches.set(start, result); return result;
  };
  for (const demand of level.demands) {
    if (demand.rate <= 0 || demand.from === demand.to) continue;
    const startId = portals.get(demand.from), finishId = portals.get(demand.to);
    if (startId === undefined || finishId === undefined) continue;
    const start = root(startId), finish = root(finishId);
    if (start === finish) continue;
    const { costs, previous } = shortest(start);
    if (!previous.has(finish)) continue;
    const points: Point[] = [positions[finish]], layers: string[] = [];
    let n = finish;
    while (n !== start) { const p = previous.get(n)!; points.unshift(positions[p.node]); layers.unshift(p.layer); n = p.node; }
    const cumulative = [0];
    for (let i = 1; i < points.length; i++) cumulative.push(cumulative[i - 1] + distance(points[i - 1], points[i]));
    routes.set(demand.id, { points, layers, cumulative, length: costs.get(finish)! });
  }
  return { routes, connected: routes.size, total: level.demands.filter(d => d.rate > 0 && d.from !== d.to).length };
}

export function analyzeNetwork(level: Level): { connected: number; total: number; routes: Map<string, Point[]> } {
  const network = buildNetwork(level);
  return { connected: network.connected, total: network.total,
    routes: new Map([...network.routes].map(([id, route]) => [id, route.points.map(p => ({ ...p }))])) };
}

interface Vehicle { id: number; route: Route; distance: number; color: string; position: Point; angle: number; layer: string; waiting: boolean }
interface Source { rate: number; accumulator: number; pending: number; route?: Route; color: string }
function sample(route: Route, travel: number): { position: Point; angle: number; layer: string } {
  let low = 1, high = route.points.length - 1;
  while (low < high) { const mid = (low + high) >> 1; if (route.cumulative[mid] < travel) low = mid + 1; else high = mid; }
  const a = route.points[low - 1], b = route.points[low];
  const length = route.cumulative[low] - route.cumulative[low - 1];
  return { position: lerp(a, b, Math.min(1, (travel - route.cumulative[low - 1]) / (length || 1))), angle: Math.atan2(b.y - a.y, b.x - a.x), layer: route.layers[low - 1] };
}

export class Simulation {
  private network!: Network;
  private sources: Source[] = [];
  private vehicles: Vehicle[] = [];
  private nextId = 1;
  private spawned = 0;
  private arrived = 0;
  private elapsed = 0;
  constructor(level: Level) { this.reset(level); }
  reset(level: Level): void {
    this.network = buildNetwork(level); this.vehicles = []; this.nextId = 1;
    this.spawned = 0; this.arrived = 0; this.elapsed = 0;
    this.sources = level.demands.filter(d => d.rate > 0 && d.from !== d.to).map(d => ({ rate: d.rate, accumulator: 0, pending: 0,
      route: this.network.routes.get(d.id), color: level.portals.find(p => p.id === d.from)?.color ?? '#e89463' }));
  }
  get cars(): Car[] { return this.vehicles.map(v => ({ id: v.id, position: { ...v.position }, angle: v.angle, color: v.color, waiting: v.waiting })); }
  get stats(): SimulationStats {
    const pending = this.sources.reduce((s, d) => s + d.pending, 0);
    const waiting = pending + this.vehicles.filter(v => v.waiting).length;
    const demand = this.sources.reduce((s, d) => s + d.rate, 0);
    const reachable = this.sources.reduce((s, d) => s + (d.route ? d.rate : 0), 0);
    const delay = this.vehicles.length ? this.vehicles.filter(v => v.waiting).length / this.vehicles.length : 0;
    const queue = this.sources.filter(s => s.route).reduce((s, d) => s + d.pending, 0);
    const efficiency = demand ? Math.round(100 * reachable / demand * Math.max(0, 1 - delay) / (1 + queue * 0.06)) : 100;
    return { spawned: this.spawned, arrived: this.arrived, active: this.vehicles.length, waiting,
      connected: this.network.connected, total: this.network.total, efficiency, elapsed: this.elapsed };
  }
  step(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    let remaining = Math.min(dt, 2);
    while (remaining > EPS) { const delta = Math.min(remaining, 1 / 30); this.tick(delta); remaining -= delta; }
  }
  private tick(dt: number): void {
    this.elapsed += dt;
    for (const source of this.sources) {
      source.accumulator += source.rate / 60 * dt;
      const count = Math.floor(source.accumulator);
      source.accumulator -= count; this.spawned += count;
      source.pending = Math.min(MAX_PENDING, source.pending + count);
    }
    // A spatial index keeps large test runs and busy levels inexpensive.
    const grid = new Map<string, Vehicle[]>();
    const cell = (p: Point) => `${Math.floor(p.x / 32)},${Math.floor(p.y / 32)}`;
    const nearby = (p: Point) => {
      const out: Vehicle[] = [], x = Math.floor(p.x / 32), y = Math.floor(p.y / 32);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) out.push(...(grid.get(`${x + dx},${y + dy}`) ?? []));
      return out;
    };
    const put = (v: Vehicle) => { const key = cell(v.position), list = grid.get(key) ?? []; list.push(v); grid.set(key, list); };
    this.vehicles.forEach(put);
    const survivors: Vehicle[] = [];
    for (const v of this.vehicles) {
      const nextDistance = Math.min(v.route.length, v.distance + SPEED * dt), next = sample(v.route, nextDistance);
      const blocked = nearby(next.position).some(other => {
        if (v.id === other.id || (next.layer !== other.layer && next.layer !== 'ground' && other.layer !== 'ground')) return false;
        // Ground roads never interact with the interior of an elevated road.
        if ((next.layer === 'ground') !== (other.layer === 'ground')) return false;
        const dx = other.position.x - next.position.x, dy = other.position.y - next.position.y;
        if (Math.hypot(dx, dy) >= GAP) return false;
        const heading = Math.cos(next.angle - other.angle);
        // The long safety gap applies along a lane, not across adjacent narrow lanes.
        if (Math.abs(heading) > 0.75 && Math.abs(-dx * Math.sin(next.angle) + dy * Math.cos(next.angle)) >= 8) return false;
        const aligned = heading > 0.75;
        if (aligned) return dx * Math.cos(next.angle) + dy * Math.sin(next.angle) > -3;
        // Older vehicles have right of way across a junction, avoiding mutual deadlock.
        return other.id < v.id;
      });
      v.waiting = blocked;
      if (!blocked) {
        const oldKey = cell(v.position), list = grid.get(oldKey)!;
        list.splice(list.indexOf(v), 1);
        v.distance = nextDistance; Object.assign(v, next); put(v);
      }
      if (v.distance >= v.route.length - EPS) {
        this.arrived++;
        const list = grid.get(cell(v.position))!; list.splice(list.indexOf(v), 1);
      } else survivors.push(v);
    }
    this.vehicles = survivors;
    for (const source of this.sources) {
      if (!source.pending || !source.route || this.vehicles.length >= MAX_CARS) continue;
      const first = sample(source.route, 0);
      if (nearby(first.position).some(v => v.layer === first.layer && distance(v.position, first.position) < GAP)) continue;
      const vehicle = { id: this.nextId++, route: source.route, distance: 0, color: source.color, waiting: false, ...first };
      this.vehicles.push(vehicle); put(vehicle); source.pending--;
    }
  }
}
