const CACHE_NAME = 'doctorai-shell-v116';
const APP_SHELL = ['/care-access', '/supported-access', '/access-pages.css?v=1', '/access-pages.js?v=1', '/accessibility.css?v=6', '/research.css?v=10', '/release-design.css?v=2', '/resource-share.css', '/resource-share.css?v=2', '/resource-share.js', '/resource-share.js?v=1', '/appointment-checklist', '/appointment-checklist.css', '/appointment-checklist.js', '/', '/welcome.css?v=2', '/welcome.js?v=1', '/care-design.css?v=7', '/health-hub', '/accessibility.css?v=9', '/feature-icons.js?v=1', '/subscription', '/terms', '/privacy', '/research', '/download', '/medication-list-template', '/medication-list-template.css', '/medication-list-template.js', '/managed-profiles.css?v=3', '/health-hub.css?v=72', '/self-cache.js?v=2', '/health-hub.js?v=70', '/subscription.css?v=9', '/subscription.js?v=14', '/research.css?v=8', '/research.js?v=8', '/site-shell.css?v=2', '/site-shell.js?v=3', '/branding.js?v=10', '/logo-loader.js?v=10', '/pwa.js?v=15', '/doctorai-public-logo-transparent.png?v=10', '/doctorai-head-logo-transparent.png?v=10', '/doctorai-app-icon.png?v=10', '/google-g-logo.svg', '/manifest.webmanifest'];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))); self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('doctorai-shell-') && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(response => { if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone())); return response; }).catch(() => caches.match(request).then(cached => cached || caches.match('/health-hub'))));
    return;
  }
  event.respondWith(fetch(request).then(response => { if (response.ok && response.type === 'basic') caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone())); return response; }).catch(() => caches.match(request)));
});
