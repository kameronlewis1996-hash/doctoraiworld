import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const host = 'www.doctoraiworld.com';
const indexNowEndpoint = 'https://api.indexnow.org/indexnow';
const blockedPaths = [
  '/health-hub',
  '/subscription',
  '/staff',
  '/mobile-auth',
  '/download',
  '/api',
  '/terms',
  '/privacy',
];

function getAttribute(tag, name) {
  const pattern = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  for (const match of tag.matchAll(pattern)) {
    if (match[1].toLowerCase() === name.toLowerCase()) {
      return match[2] ?? match[3] ?? match[4] ?? '';
    }
  }
  return '';
}

function canonicalFromHtml(html) {
  const tags = html.match(/<link\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    if (getAttribute(tag, 'rel').toLowerCase().split(/\s+/).includes('canonical')) {
      return getAttribute(tag, 'href');
    }
  }
  return '';
}

function hasNoindex(html) {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  return tags.some((tag) => {
    const name = getAttribute(tag, 'name').toLowerCase();
    const content = getAttribute(tag, 'content').toLowerCase();
    return (name === 'robots' || name === 'googlebot' || name === 'bingbot')
      && content.split(/[\s,]+/).includes('noindex');
  });
}

async function getPublicKey() {
  // IndexNow's root file is a public ownership proof, not an account credential.
  const keyFilePattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.txt$/i;
  const candidates = (await readdir(siteRoot)).filter((name) => keyFilePattern.test(name));
  if (candidates.length !== 1) {
    throw new Error('Expected exactly one root IndexNow verification file.');
  }
  const keyFile = candidates[0];
  const key = (await readFile(resolve(siteRoot, keyFile), 'utf8')).trim();
  if (key !== keyFile.slice(0, -4)) {
    throw new Error('The IndexNow verification file must contain its own key.');
  }
  return { key, keyLocation: 'https://' + host + '/' + keyFile };
}

function parseTarget(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Use an absolute canonical https://www.doctoraiworld.com URL.');
  }

  if (
    url.protocol !== 'https:'
    || url.hostname !== host
    || url.username
    || url.password
    || url.search
    || url.hash
    || url.pathname === '/'
  ) {
    throw new Error('Only canonical public resource URLs on https://www.doctoraiworld.com are accepted.');
  }

  const routePath = url.pathname.replace(/\.html$/i, '');
  if (blockedPaths.some((path) => routePath === path || routePath.startsWith(path + '/'))) {
    throw new Error('This route is private, transactional, or non-editorial and cannot be submitted.');
  }

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  } catch {
    throw new Error('The URL path contains invalid encoding.');
  }
  if (!decodedPath || decodedPath.includes('\\') || decodedPath.split('/').some((part) => part === '..')) {
    throw new Error('The URL path is not a valid public file path.');
  }

  const candidatePath = resolve(siteRoot, decodedPath + (extname(decodedPath) ? '' : '.html'));
  const fromRoot = relative(siteRoot, candidatePath);
  if (!fromRoot || fromRoot.startsWith('..' + sep) || fromRoot === '..') {
    throw new Error('The URL does not map to a public page in this repository.');
  }
  return { url, candidatePath };
}

async function checkLocalPage(target) {
  await stat(target.candidatePath);
  const html = await readFile(target.candidatePath, 'utf8');
  if (canonicalFromHtml(html) !== target.url.href) {
    throw new Error('The local page canonical must exactly match ' + target.url.href + '.');
  }
  if (hasNoindex(html)) {
    throw new Error('The local page is marked noindex.');
  }
}

async function checkLivePage(target) {
  const response = await fetch(target.url, { redirect: 'follow' });
  if (!response.ok || response.url !== target.url.href) {
    throw new Error('The public page did not return HTTP 200 at its canonical URL.');
  }
  if (!(response.headers.get('content-type') ?? '').toLowerCase().includes('text/html')) {
    throw new Error('The public URL did not return an HTML page.');
  }
  if ((response.headers.get('x-robots-tag') ?? '').toLowerCase().includes('noindex')) {
    throw new Error('The public page response is marked noindex.');
  }
  const html = await response.text();
  if (canonicalFromHtml(html) !== target.url.href || hasNoindex(html)) {
    throw new Error('The public page canonical or indexing directive does not match the requested URL.');
  }
}

async function main() {
  const inputUrls = process.argv.slice(2);
  if (inputUrls.length === 0 || inputUrls.length > 10000) {
    throw new Error('Provide 1–10,000 changed canonical resource URLs.');
  }

  const targets = inputUrls.map(parseTarget);
  const uniqueUrls = new Set(targets.map((target) => target.url.href));
  if (uniqueUrls.size !== targets.length) {
    throw new Error('Remove duplicate URLs before submitting.');
  }

  for (const target of targets) {
    await checkLocalPage(target);
    await checkLivePage(target);
  }

  const { key, keyLocation } = await getPublicKey();
  const keyResponse = await fetch(keyLocation, { redirect: 'follow' });
  const publishedKey = (await keyResponse.text()).trim();
  if (!keyResponse.ok || publishedKey !== key) {
    throw new Error('The public IndexNow verification file is not available or does not match.');
  }

  const response = await fetch(indexNowEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      host,
      key,
      keyLocation,
      urlList: targets.map((target) => target.url.href),
    }),
  });

  if (response.status === 200) {
    console.log('IndexNow accepted the changed public URL submission for processing. This does not confirm indexing or ranking.');
    return;
  }
  if (response.status === 202) {
    console.log('IndexNow received the submission while verification is pending. This does not confirm indexing or ranking.');
    return;
  }
  throw new Error('IndexNow returned HTTP ' + response.status + '. No indexing outcome is confirmed.');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
