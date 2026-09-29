(() => {
  const brand = window.DOCTORAI_BRANDING || {
    publicLogo: '/doctorai-public-logo-transparent.png?v=10',
    headLogo: '/doctorai-head-logo-transparent.png?v=10',
    appIcon: '/doctorai-app-icon.png?v=10',
    themeColor: '#173550'
  };
  const images = () => document.querySelectorAll('img[data-brand-logo], .brand-lockup img, .research-brand img, .pro-brand-logo, .home-hero-logo');
  function applyImage(image, source) {
    if (!image || image.dataset.logoLoaderSource === source) return;
    image.dataset.logoLoaderSource = source;
    image.onerror = () => { image.onerror = null; image.dataset.logoLoaderSource = brand.headLogo; image.src = brand.headLogo; };
    image.src = source;
  }
  function applyLogo() {
    images().forEach(image => applyImage(image, brand.publicLogo));
    document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]').forEach(link => { link.href = brand.appIcon; link.type = 'image/png'; });
    const theme = document.querySelector('meta[name="theme-color"]');
    if (theme) theme.content = brand.themeColor;
  }
  document.addEventListener('DOMContentLoaded', applyLogo, { once: true });
})();
