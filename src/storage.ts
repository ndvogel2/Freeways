import { COLORS, WORLD } from './types';
import type { Demand, Level, Point, Portal, Road } from './types';

const LIBRARY_KEY = 'slipstream.library.v1';
const WORKSPACE_KEY = 'slipstream.workspace.v1';
const MAX_LEVELS = 250;
const MAX_IMPORT_BYTES = 5_000_000;

export function createId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `level-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function createDemoLevel(): Level {
  return {
    version: 1, id: createId(), name: 'Four corners',
    description: 'Four destinations. A fresh stretch of land. Make every journey a little better.',
    portals: [
      { id: 'west', name: 'West Gate', x: 90, y: 400, color: COLORS[0] },
      { id: 'north', name: 'Northworks', x: 650, y: 90, color: COLORS[1] },
      { id: 'east', name: 'East Bank', x: 1100, y: 390, color: COLORS[2] },
      { id: 'south', name: 'South Yard', x: 720, y: 750, color: COLORS[3] },
    ],
    demands: [
      { id: 'west-east', from: 'west', to: 'east', rate: 36 },
      { id: 'west-north', from: 'west', to: 'north', rate: 24 },
      { id: 'north-south', from: 'north', to: 'south', rate: 30 },
      { id: 'south-east', from: 'south', to: 'east', rate: 20 },
    ],
    roads: [], updatedAt: Date.now(),
  };
}

export function createBlankLevel(): Level {
  return {
    version: 1, id: createId(), name: 'Untitled crossing', description: '',
    portals: [
      { id: 'west', name: 'West Gate', x: 110, y: 425, color: COLORS[0] },
      { id: 'east', name: 'East Bank', x: 1090, y: 425, color: COLORS[1] },
    ],
    demands: [{ id: 'west-east', from: 'west', to: 'east', rate: 30 }],
    roads: [], updatedAt: Date.now(),
  };
}

export function cloneLevel(level: Level): Level {
  const copy = validateLevel(level);
  return { ...copy, id: createId(), name: `${copy.name.slice(0, 95)} copy`, updatedAt: Date.now() };
}

function object(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name} must be an object.`);
  return value as Record<string, unknown>;
}

function text(value: unknown, name: string, max: number, allowEmpty = false): string {
  if (typeof value !== 'string' || value.length > max || (!allowEmpty && !value.trim()) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
    throw new Error(`${name} must be ${allowEmpty ? 'text' : 'nonempty text'} of at most ${max} characters.`);
  }
  return value;
}

function identifier(value: unknown, name: string): string {
  const id = text(value, name, 100);
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error(`${name} may only contain letters, numbers, hyphens, and underscores.`);
  return id;
}

function finiteNumber(value: unknown, name: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${name} must be a number between ${min} and ${max}.`);
  }
  return value;
}

function point(raw: unknown, name: string): Point {
  const p = object(raw, name);
  return { x: finiteNumber(p.x, `${name} x`, 0, WORLD.width), y: finiteNumber(p.y, `${name} y`, 0, WORLD.height) };
}

function array(value: unknown, name: string, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new Error(`${name} must be an array with at most ${max} entries.`);
  return value;
}

function unique(ids: string[], name: string): void {
  if (new Set(ids).size !== ids.length) throw new Error(`${name} IDs must be unique.`);
}

/** Validate imported or persisted data and return a fresh, known-schema copy. */
export function validateLevel(raw: unknown): Level {
  const value = object(raw, 'Level');
  if (value.version !== 1) throw new Error('This level uses an unsupported format version. Expected version 1.');
  const portals: Portal[] = array(value.portals, 'Destinations', 24).map((rawPortal, index) => {
    const p = object(rawPortal, `Destination ${index + 1}`);
    if (typeof p.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(p.color)) throw new Error('Destination color must be a six-digit hex color.');
    return { ...point(p, `Destination ${index + 1}`), id: identifier(p.id, 'Destination ID'), name: text(p.name, 'Destination name', 40), color: p.color };
  });
  unique(portals.map(p => p.id), 'Destination');
  const portalIds = new Set(portals.map(p => p.id));
  const demands: Demand[] = array(value.demands, 'Traffic demands', 256).map(rawDemand => {
    const d = object(rawDemand, 'Traffic demand');
    const from = identifier(d.from, 'Origin ID'), to = identifier(d.to, 'Destination ID');
    if (!portalIds.has(from) || !portalIds.has(to)) throw new Error('Every traffic demand must refer to existing destinations.');
    if (from === to) throw new Error('A traffic demand needs two different destinations.');
    return { id: identifier(d.id, 'Traffic demand ID'), from, to, rate: finiteNumber(d.rate, 'Traffic rate', 1, 180) };
  });
  unique(demands.map(d => d.id), 'Traffic demand');
  let pointCount = 0;
  const roads: Road[] = array(value.roads, 'Roads', 250).map(rawRoad => {
    const r = object(rawRoad, 'Road');
    const points = array(r.points, 'Road points', 1500).map(p => point(p, 'Road point'));
    pointCount += points.length;
    if (points.length < 2) throw new Error('Each road needs at least two points.');
    if (pointCount > 12_000) throw new Error('This level has too many road points (maximum 12,000).');
    if (typeof r.bridge !== 'boolean') throw new Error('Each road must specify whether it is a bridge.');
    return { id: identifier(r.id, 'Road ID'), points, bridge: r.bridge };
  });
  unique(roads.map(r => r.id), 'Road');
  return {
    version: 1, id: identifier(value.id, 'Level ID'), name: text(value.name, 'Level name', 100),
    description: text(value.description ?? '', 'Description', 1000, true), portals, demands, roads,
    updatedAt: finiteNumber(value.updatedAt, 'Last modified time', 0, Number.MAX_SAFE_INTEGER),
  };
}

export function slugify(name: string): string {
  return name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'custom-level';
}

export function parseImport(source: string): Level[] {
  if (source.length > MAX_IMPORT_BYTES) throw new Error('This file is too large. Please import a JSON file smaller than 5 MB.');
  let parsed: unknown;
  try { parsed = JSON.parse(source); } catch { throw new Error('This is not a valid JSON file. Choose an exported Slipstream level or library.'); }
  const value = object(parsed, 'Import');
  if (value.format === 'slipstream-library') {
    if (value.version !== 1) throw new Error('This library uses an unsupported format version.');
    const levels = array(value.levels, 'Library', MAX_LEVELS);
    if (!levels.length) throw new Error('This library contains no levels.');
    const result = levels.map(validateLevel);
    unique(result.map(level => level.id), 'Level');
    return result;
  }
  return [validateLevel(value)];
}

export function loadLibrary(): Level[] {
  try {
    const source = globalThis.localStorage?.getItem(LIBRARY_KEY);
    if (!source) return [];
    const data: unknown = JSON.parse(source);
    if (!Array.isArray(data)) return [];
    const result: Level[] = [];
    const seen = new Set<string>();
    for (const raw of data.slice(0, MAX_LEVELS)) {
      try {
        const level = validateLevel(raw);
        if (!seen.has(level.id)) { result.push(level); seen.add(level.id); }
      } catch { /* Retain the valid levels when a single saved entry is corrupt. */ }
    }
    return result;
  } catch { return []; }
}

export function saveLibrary(levels: Level[]): void {
  if (levels.length > MAX_LEVELS) throw new Error('Your local library is full (250 levels). Export a backup before removing older levels.');
  const validated = levels.map(validateLevel);
  unique(validated.map(level => level.id), 'Level');
  try { globalThis.localStorage.setItem(LIBRARY_KEY, JSON.stringify(validated)); }
  catch { throw new Error('Your browser could not save the library. Export your levels to keep a backup, or allow local storage.'); }
}

export function loadWorkspace(): Level | null {
  try {
    const source = globalThis.localStorage?.getItem(WORKSPACE_KEY);
    return source ? validateLevel(JSON.parse(source)) : null;
  } catch { return null; }
}

export function saveWorkspace(level: Level): void {
  try { globalThis.localStorage.setItem(WORKSPACE_KEY, JSON.stringify(validateLevel(level))); }
  catch { throw new Error('Your browser could not autosave this workspace. Export the level to keep your work.'); }
}

function downloadJSON(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadLevel(level: Level): void {
  downloadJSON(validateLevel(level), `${slugify(level.name)}.slipstream.json`);
}

export function downloadLibrary(levels: Level[]): void {
  if (!levels.length) throw new Error('Save a level to your library before exporting it.');
  if (levels.length > MAX_LEVELS) throw new Error('A library can contain at most 250 levels.');
  downloadJSON({ format: 'slipstream-library', version: 1, levels: levels.map(validateLevel) }, 'slipstream-library.json');
}
