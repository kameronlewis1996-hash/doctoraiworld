const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
const redirects = config.redirects || [];
const rewrites = config.rewrites || [];

assert.equal(config.cleanUrls, true, 'Clean URLs must remain enabled for /about.');
assert.ok(fs.existsSync(path.join(root, 'about.html')), 'about.html must exist.');
assert.equal(
  redirects.some((redirect) => redirect.source === '/about'),
  false,
  '/about must not redirect to the Health Hub or another page.',
);

function fileForLink(href) {
  const url = new URL(href, 'https://doctoraiworld.test');
  assert.equal(url.origin, 'https://doctoraiworld.test', 'Only local footer links are resolved here.');

  const redirect = redirects.find((item) => item.source === url.pathname);
  const rewrite = rewrites.find((item) => item.source === url.pathname);
  const routedPath = (redirect || rewrite)?.destination.split(/[?#]/, 1)[0] || url.pathname;
  if (routedPath === '/') return path.join(root, 'index.html');

  const cleanPath = routedPath.replace(/^\/+/, '');
  const candidates = [
    path.join(root, `${cleanPath}.html`),
    path.join(root, cleanPath, 'index.html'),
    path.join(root, cleanPath),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

for (const filename of ['index.html', 'health-hub.html', 'about.html']) {
  const html = fs.readFileSync(path.join(root, filename), 'utf8');
  const footer = html.match(/<footer\b[^>]*>([\s\S]*?)<\/footer>/i)?.[1];
  assert.ok(footer, `${filename} must have a footer.`);

  const links = [...footer.matchAll(/<a\b[^>]*\bhref="([^"]+)"/gi)].map((match) => match[1]);
  assert.ok(links.includes('/about'), `${filename} footer must link to About.`);

  for (const href of links) {
    if (/^(?:mailto:|tel:|https?:)/i.test(href)) continue;
    const target = fileForLink(href);
    assert.ok(target, `${filename} footer link ${href} must resolve to a local file or route.`);
  }
}

console.log('About route and homepage, Health Hub, and About footer links verified.');
