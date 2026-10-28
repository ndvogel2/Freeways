import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeNetwork, Simulation } from '../src/simulation';
import type { Level, Road } from '../src/types';

function fixture(roads: Road[], demands = [{ id: 'ab', from: 'a', to: 'b', rate: 30 }]): Level {
  return { version: 1, id: 'test', name: 'Test', description: '', updatedAt: 0,
    portals: [{ id: 'a', name: 'A', x: 100, y: 100, color: '#f00' }, { id: 'b', name: 'B', x: 500, y: 100, color: '#0f0' },
      { id: 'c', name: 'C', x: 300, y: 300, color: '#00f' }], roads, demands };
}
const road = (id: string, points: Array<[number, number]>, bridge = false): Road => ({ id, points: points.map(([x,y]) => ({ x,y })), bridge });

test('roads carry traffic only in the drawn direction', () => {
  const level = fixture([road('r', [[100,100],[500,100]])], [
    {id:'ab',from:'a',to:'b',rate:30}, {id:'ba',from:'b',to:'a',rate:30}]);
  const network = analyzeNetwork(level);
  assert.equal(network.connected, 1); assert.equal(network.total, 2);
  assert.ok(network.routes.has('ab')); assert.ok(!network.routes.has('ba'));
});
test('ground crossing provides a directed turning route', () => {
  const level = fixture([road('r',[[100,100],[500,100]]),road('s',[[300,20],[300,300]])], [{id:'ac',from:'a',to:'c',rate:30}]);
  const network = analyzeNetwork(level);
  assert.equal(network.connected,1);
  assert.deepEqual(network.routes.get('ac'), [{x:100,y:100},{x:300,y:100},{x:300,y:300}]);
});
test('bridge interior crosses without connecting to ground', () => {
  const level = fixture([road('r',[[100,100],[500,100]]),road('s',[[300,20],[300,300]],true)], [{id:'ac',from:'a',to:'c',rate:30}]);
  assert.equal(analyzeNetwork(level).connected,0);
});
test('a bridge endpoint can join a ground road', () => {
  const level = fixture([road('r',[[100,100],[500,100]]),road('s',[[300,100],[300,300]],true)], [{id:'ac',from:'a',to:'c',rate:30}]);
  assert.equal(analyzeNetwork(level).connected,1);
});
test('near endpoints snap to portals and ground roads', () => {
  const level = fixture([road('r',[[115,105],[290,100]]),road('s',[[305,110],[490,105]])]);
  assert.equal(analyzeNetwork(level).connected,1);
});
test('nearby parallel road interiors remain separate', () => {
  const level = fixture([road('r',[[100,100],[500,100]]),road('s',[[200,120],[400,120]])], [{id:'ba',from:'b',to:'a',rate:30}]);
  assert.equal(analyzeNetwork(level).connected,0);
});
test('connected traffic spawns, moves, and arrives; reset clears counters', () => {
  const level = fixture([road('r',[[100,100],[500,100]])]);
  const sim = new Simulation(level);
  for (let i=0;i<900;i++) sim.step(1/30);
  assert.ok(sim.stats.spawned >= 14); assert.ok(sim.stats.arrived >= 10);
  assert.ok(sim.stats.active > 0); assert.equal(sim.stats.connected,1);
  assert.equal(sim.stats.waiting,0); assert.equal(sim.stats.efficiency,100);
  sim.reset(level); assert.equal(sim.stats.elapsed,0); assert.equal(sim.stats.spawned,0); assert.equal(sim.cars.length,0);
});
test('disconnected traffic waits with a bounded backlog and no fake arrivals', () => {
  const sim = new Simulation(fixture([]));
  for(let i=0;i<500;i++) sim.step(1);
  assert.equal(sim.stats.arrived,0); assert.equal(sim.stats.active,0);
  assert.equal(sim.stats.waiting,120); assert.equal(sim.stats.efficiency,0);
});
test('inactive demands do not count against connectivity', () => {
  const level = fixture([], [{id:'off',from:'a',to:'b',rate:0}]);
  assert.equal(analyzeNetwork(level).total,0);
  assert.equal(new Simulation(level).stats.efficiency,100);
});

test('multi-segment curves split at intersections and continue onto a snapped road end', () => {
  const level = fixture([
    road('curve', [[100,100],[180,50],[250,100],[350,120],[500,100]]),
    road('turn', [[300,30],[300,200],[305,288]]),
  ], [{id:'ac',from:'a',to:'c',rate:30}]);
  const route = analyzeNetwork(level).routes.get('ac');
  assert.ok(route);
  assert.ok(route.some(p => Math.abs(p.x - 300) < 0.001 && Math.abs(p.y - 110) < 0.001));
  assert.deepEqual(route[0], {x:100,y:100});
  assert.deepEqual(route.at(-1), {x:300,y:300});
  const sim = new Simulation(level);
  for(let i=0;i<30;i++) sim.step(1);
  assert.ok(sim.stats.arrived > 0);
  assert.ok(sim.cars.every(c => Number.isFinite(c.angle) && Number.isFinite(c.position.x)));
});

test('a bridge remains separate where an intermediate curve vertex crosses a ground road', () => {
  const level = fixture([
    road('ground', [[100,100],[200,100],[500,100]]),
    road('bridge', [[300,20],[300,100],[300,200],[300,300]], true),
  ], [{id:'ac',from:'a',to:'c',rate:30}]);
  assert.equal(analyzeNetwork(level).connected, 0);
});

test('efficiency uses percentage units and demand-weighted connectivity', () => {
  const level = fixture([road('r',[[100,100],[500,100]])], [
    {id:'ab',from:'a',to:'b',rate:30}, {id:'ac',from:'a',to:'c',rate:70},
  ]);
  const sim = new Simulation(level);
  assert.equal(sim.stats.efficiency, 30);
  for(let i=0;i<20;i++) sim.step(1);
  assert.equal(sim.stats.efficiency, 30);
  assert.ok(sim.stats.waiting > 0);
  assert.equal(sim.stats.connected, 1); assert.equal(sim.stats.total, 2);
  level.roads.push(road('to-c', [[500,100],[500,300],[300,300]]));
  sim.reset(level);
  assert.equal(sim.stats.connected, 2); assert.equal(sim.stats.efficiency, 100);
  assert.equal(sim.stats.elapsed, 0); assert.equal(sim.stats.waiting, 0); assert.equal(sim.cars.length, 0);
});

test('long curves route and simulate without repeatedly scanning every point per car', () => {
  const points: Array<[number, number]> = Array.from({length:1500}, (_,i) => [100 + 400 * i / 1499, 100 + Math.sin(i / 90) * 15]);
  points[1499] = [500,100];
  const level = fixture([road('curve', points)]);
  const sim = new Simulation(level);
  assert.equal(sim.stats.connected, 1);
  for(let i=0;i<30;i++) sim.step(1);
  assert.ok(sim.stats.arrived >= 8);
});
