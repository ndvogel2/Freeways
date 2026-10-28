import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Keep the game playable as one local file: no server, CDN, or asset folder.
const dist = path.resolve(fileURLToPath(new URL('../dist/', import.meta.url)));
let html = await readFile(path.join(dist, 'index.html'), 'utf8');
const asset = (url) => {
  const resolved = path.resolve(dist, url.replace(/^\/+/, ''));
  if (!resolved.startsWith(dist + path.sep)) {
    throw new Error('An asset points outside the build directory.');
  }
  return resolved;
};

const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g)];
const styles = [...html.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"[^>]*>/g)];
if (scripts.length !== 1 || styles.length !== 1) throw new Error('Expected one game script and stylesheet.');
const javascript = await readFile(asset(scripts[0][1]), 'utf8');
const css = await readFile(asset(styles[0][1]), 'utf8');
html = html.replace(scripts[0][0], () => `<script type="module">${javascript.replace(/<\/script/gi, '<\\/script')}</script>`);
html = html.replace(styles[0][0], () => `<style>${css.replace(/<\/style/gi, '<\\/style')}</style>`);
await writeFile(path.join(dist, 'Slipstream.html'), html);
console.log('Portable game: dist/Slipstream.html — open directly in your browser.');
