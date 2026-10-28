import test from 'node:test';
import assert from 'node:assert/strict';
import { cloneLevel, createBlankLevel, createDemoLevel, loadLibrary, loadWorkspace, parseImport, saveLibrary, saveWorkspace, slugify, validateLevel } from '../src/storage';

test('starter levels have valid traffic demands and no prebuilt solution', () => {
  for (const level of [createDemoLevel(), createBlankLevel()]) {
    assert.deepEqual(validateLevel(level), level);
    assert.equal(level.roads.length, 0);
    assert.ok(level.demands.length > 0);
  }
});

test('cloning creates independent level data with a fresh identity', () => {
  const original = createDemoLevel();
  const clone = cloneLevel(original);
  assert.notEqual(clone.id, original.id);
  assert.match(clone.name, / copy$/);
  clone.portals[0].name = 'Changed';
  clone.demands[0].rate = 100;
  assert.equal(original.portals[0].name, 'West Gate');
  assert.equal(original.demands[0].rate, 36);
});

test('validation rejects invalid coordinates, colors, rates, references, and IDs', () => {
  const mutate = (fn: (level: ReturnType<typeof createDemoLevel>) => void) => {
    const level = createDemoLevel(); fn(level); return level;
  };
  assert.throws(() => validateLevel(mutate(l => { l.portals[0].x = Infinity; })), /Destination 1 x/);
  assert.throws(() => validateLevel(mutate(l => { l.portals[0].y = -1; })), /Destination 1 y/);
  assert.throws(() => validateLevel(mutate(l => { l.portals[0].color = 'url(example)'; })), /color/);
  assert.throws(() => validateLevel(mutate(l => { l.demands[0].rate = 0; })), /Traffic rate/);
  assert.throws(() => validateLevel(mutate(l => { l.demands[0].to = 'missing'; })), /existing destinations/);
  assert.throws(() => validateLevel(mutate(l => { l.demands[0].to = l.demands[0].from; })), /two different/);
  assert.throws(() => validateLevel(mutate(l => { l.portals[1].id = l.portals[0].id; })), /unique/);
  assert.throws(() => validateLevel(mutate(l => { l.id = '../evil'; })), /letters, numbers/);
  assert.throws(() => validateLevel(mutate(l => { l.name = 'a\u0000b'; })), /Level name/);
});

test('validation bounds road complexity and copies points', () => {
  const level = createBlankLevel();
  level.roads.push({ id: 'road-1', bridge: false, points: [{x: 10, y: 10}, {x: 100, y: 100}] });
  const validated = validateLevel(level);
  validated.roads[0].points[0].x = 50;
  assert.equal(level.roads[0].points[0].x, 10);
  level.roads[0].points = [{x: 1, y: 2}];
  assert.throws(() => validateLevel(level), /at least two/);
  level.roads[0].points = Array.from({length: 1501}, () => ({ x: 0, y: 0 }));
  assert.throws(() => validateLevel(level), /at most 1500/);
});

test('JSON import round-trips individual levels and multi-level libraries', () => {
  const first = createDemoLevel(), second = createBlankLevel();
  assert.deepEqual(parseImport(JSON.stringify(first)), [first]);
  assert.deepEqual(parseImport(JSON.stringify({format: 'slipstream-library', version: 1, levels: [first, second]})), [first, second]);
  assert.throws(() => parseImport('{'), /not a valid JSON/);
  assert.throws(() => parseImport(JSON.stringify({ ...first, version: 2 })), /unsupported/);
  assert.throws(() => parseImport(JSON.stringify({format: 'slipstream-library', version: 1, levels: [first, first]})), /unique/);
  assert.throws(() => parseImport(JSON.stringify({format: 'slipstream-library', version: 1, levels: []})), /no levels/);
  assert.throws(() => parseImport(' '.repeat(5_000_001)), /too large/);
});

test('export names remove unsafe path characters and handle empty names', () => {
  assert.equal(slugify('Café / North & South!'), 'cafe-north-south');
  assert.equal(slugify('../../'), 'custom-level');
});

test('local library/workspace persist, preserve valid entries, and survive corrupt storage', () => {
  const data = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
  } });
  try {
    const level = createDemoLevel();
    saveLibrary([level]); saveWorkspace(level);
    assert.deepEqual(loadLibrary(), [level]);
    assert.deepEqual(loadWorkspace(), level);
    data.set('slipstream.library.v1', JSON.stringify([level, {broken: true}, level]));
    assert.deepEqual(loadLibrary(), [level]);
    data.set('slipstream.library.v1', 'not json');
    data.set('slipstream.workspace.v1', '{}');
    assert.deepEqual(loadLibrary(), []);
    assert.equal(loadWorkspace(), null);
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { setItem: () => { throw new Error('QuotaExceeded'); } } });
    assert.throws(() => saveLibrary([level]), /could not save/);
    assert.throws(() => saveWorkspace(level), /could not autosave/);
  } finally { Reflect.deleteProperty(globalThis, 'localStorage'); }
});
