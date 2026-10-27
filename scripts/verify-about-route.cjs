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

const aboutHtml = fs.readFileSync(path.join(root, 'about.html'), 'utf8');
const mobileMenu = aboutHtml.match(/<details class="home-mobile-menu" data-home-menu>([\s\S]*?)<\/details>/);
assert.ok(mobileMenu, 'About must provide a mobile navigation disclosure.');
assert.match(mobileMenu[1], /<summary>Menu<\/summary>/, 'The mobile navigation must have a clear keyboard-operable label.');
const mobileMenuLinks = [...mobileMenu[1].matchAll(/<a\b[^>]*\bhref="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
assert.ok(mobileMenuLinks.some(([, href, label]) => href === '/' && /Home/.test(label)), 'The mobile menu must keep Home reachable.');
assert.ok(mobileMenuLinks.some(([, href, label]) => href === '/health-hub#profile' && /Sign in/.test(label)), 'The mobile menu must keep Sign in reachable.');
assert.ok(mobileMenuLinks.some(([, href]) => href === '/subscription'), 'The mobile menu must link to Free and Pro.');
assert.match(aboutHtml, /<script defer src="\/welcome\.js\?v=5"><\/script>/, 'About must share the public menu Escape and outside-click behavior.');
for (const [, href] of mobileMenuLinks) {
  assert.ok(fileForLink(href), `About mobile menu link ${href} must resolve to a local route.`);
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
