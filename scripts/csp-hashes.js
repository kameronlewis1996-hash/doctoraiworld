'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const htmlFiles = fs.readdirSync(root).filter(file => file.endsWith('.html')).sort();
const blocks = { script: new Map(), style: new Map() };

for (const file of htmlFiles) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  for (const match of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
    const hash = crypto.createHash('sha256').update(match[1], 'utf8').digest('base64');
    blocks.script.set(`'sha256-${hash}'`, file);
  }
  for (const match of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
    const hash = crypto.createHash('sha256').update(match[1], 'utf8').digest('base64');
    blocks.style.set(`'sha256-${hash}'`, file);
  }
}

for (const type of ['script', 'style']) {
  console.log(`${type}-src hashes:`);
  for (const [hash, file] of blocks[type]) console.log(`${hash}  ${file}`);
}
