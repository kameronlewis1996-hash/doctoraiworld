(() => {
  'use strict';

  const example = document.querySelector('#scan-example');
  const showButton = document.querySelector('[data-show-scan-example]');
  const hideButton = document.querySelector('[data-hide-scan-example]');

  showButton?.addEventListener('click', () => {
    if (!example) return;
    example.hidden = false;
    showButton.setAttribute('aria-expanded', 'true');
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    example.scrollIntoView({ behavior, block: 'nearest' });
    const title = example.querySelector('#example-title');
    title?.setAttribute('tabindex', '-1');
    title?.focus({ preventScroll: true });
  });

  hideButton?.addEventListener('click', () => {
    if (!example) return;
    example.hidden = true;
    showButton?.setAttribute('aria-expanded', 'false');
    showButton?.focus({ preventScroll: true });
  });
})();
