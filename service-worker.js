const CACHE_NAME = 'doctorai-shell-v197';
const APP_SHELL = ['/', '/welcome-system.css?v=7', '/health-tool-landing.css?v=3', '/welcome.css?v=11', '/aurora-theme.css?v=11', '/aurora-pages.css?v=2', '/public-info-aurora.css?v=2', '/hub-aurora-secondary.css?v=6', '/welcome.js?v=5', '/care-design.css?v=10', '/health-hub', '/accessibility.css?v=15', '/feature-icons.js?v=9', '/subscription', '/about', '/about.css?v=3', '/terms', '/privacy', '/research', '/download', '/medication-list-template', '/medication-list-template.css?v=5', '/medication-list-template.js', '/appointment-checklist', '/appointment-checklist.css?v=5', '/appointment-checklist.js', '/resource-share.css?v=2', '/resource-share.js?v=1', '/health-hub.css?v=95', '/today-preview.css?v=3', '/today-records.css?v=2', '/medicine-catalog-search.js?v=2', '/term-catalogues.js?v=3', '/term-profile-ui.js?v=1', '/today-diary-core.js?v=2', '/medication-schedule-core.js?v=2', '/catalogues/conditions.v1.json', '/catalogues/medicines.v1.json', '/catalogues/allergies-reactions.v1.json', '/doctorai-layout.css?v=3', '/hub-category-themes.css?v=6', '/doctorai-medicine-illustration.png?v=1', '/medication-check-controller.js?v=5', '/medication-records.js?v=1', '/health-alerts.js?v=7', '/health-alert-status.js?v=7', '/health-hub.js?v=120', '/hub-navigation.css?v=4', '/subscription.css?v=12', '/subscription.js?v=13', '/research.css?v=14', '/site-shell.css?v=3', '/site-shell.js?v=4', '/branding.js?v=10', '/logo-loader.js?v=10', '/pwa.js?v=16', '/doctorai-public-logo-transparent.png?v=10', '/doctorai-head-logo-transparent.png?v=10', '/doctorai-app-icon.png?v=10', '/google-g-logo.svg', '/manifest.webmanifest'];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))); });
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

