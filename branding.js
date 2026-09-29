/* Canonical DoctorAI brand assets. Keep every surface on the same blue/cyan system. */
(() => {
  'use strict';
  const version = '10';
  const assets = Object.freeze({
    public: '/doctorai-public-logo-transparent.png',
    head: '/doctorai-head-logo-transparent.png',
    'app-icon': '/doctorai-app-icon.png'
  });
  const asset = name => `${assets[name] || assets.public}?v=${version}`;
  window.DOCTORAI_BRANDING = Object.freeze({
    version,
    publicLogo: asset('public'),
    headLogo: asset('head'),
    appIcon: asset('app-icon'),
    themeColor: '#173550'
  });
})();
