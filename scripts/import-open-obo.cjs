'use strict';

// Offline parser for a rights-reviewed OBO file. Importing does not authorise clinical rules.
function parseTerms(source, prefix) {
  const text = String(source || '').replace(/\r\n/g, '\n');
  const terms = [];
  for (const block of text.split(/(?=^\[Term\]$)/m).filter(part => part.startsWith('[Term]'))) {
    const id = block.match(/^id: ([A-Z]+:[0-9]+)$/m)?.[1];
    const label = block.match(/^name: (.+)$/m)?.[1]?.trim();
    if (!id?.startsWith(prefix + ':') || !label || /^is_obsolete: true$/m.test(block)) continue;
    const aliases = [...block.matchAll(/^synonym: "((?:[^"\\]|\\.)*)" EXACT/mg)].map(match => match[1].replace(/\\"/g, '"'));
    terms.push({ id, label, aliases });
  }
  const seen = new Set();
  return terms.filter(term => !seen.has(term.id) && seen.add(term.id));
}

function requireReusableLicense(license) {
  if (!['CC0-1.0', 'CC-BY-4.0'].includes(license)) throw new Error('Source license is not in the reviewed allowlist');
  return license;
}

module.exports = { parseTerms, requireReusableLicense };
