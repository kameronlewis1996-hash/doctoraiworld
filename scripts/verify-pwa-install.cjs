'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

assert.equal(manifest.start_url, '/health-hub');
assert.equal(manifest.display, 'standalone');
assert.equal(manifest.scope, '/');
assert.ok(manifest.name || manifest.short_name, 'The manifest needs an app name');

for (const size of [192, 512]) {
  const entry = manifest.icons.find(icon => icon.sizes?.split(/\s+/).includes(`${size}x${size}`));
  assert.ok(entry, `Missing ${size}x${size} install icon`);
  assert.equal(entry.type, 'image/png');
  assert.equal(entry.purpose, 'any', 'The current artwork is not prepared for maskable cropping');
  assert.ok(entry.src.startsWith('/') && !entry.src.startsWith('//'), 'Icon must be same-origin');
  const iconPath = path.join(root, decodeURIComponent(new URL(entry.src, 'https://example.invalid').pathname).slice(1));
  const png = fs.readFileSync(iconPath);
  assert.ok(png.subarray(0, 8).equals(signature), `${entry.src} is not a PNG`);
  assert.equal(png.readUInt32BE(16), size, `${entry.src} has the wrong width`);
  assert.equal(png.readUInt32BE(20), size, `${entry.src} has the wrong height`);
}

for (const page of ['health-hub.html', 'download.html']) {
  const html = fs.readFileSync(path.join(root, page), 'utf8');
  assert.match(html, /<link\s+rel="manifest"\s+href="\/manifest\.webmanifest"/);
  assert.match(html, /\/pwa\.js\?v=\d+/);
}
assert.match(fs.readFileSync(path.join(root, 'pwa.js'), 'utf8'), /serviceWorker\.register\('\/service-worker\.js/);
assert.match(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'), /"source": "\/health-hub"[\s\S]*?"destination": "\/health-hub\.html"/);

console.log('PWA install assets passed: manifest, 192px and 512px PNGs, app entry route, and install pages.');
