// Preserve old root hash links without sending new visitors past the introduction.
(() => {
  const legacyViews = ['today','ask','health','profile','symptoms','medications','appointments','results','timeline','documents','summary'];
  if (legacyViews.includes(location.hash.slice(1))) location.replace('/health-hub' + location.hash);
})();

// Decorative logo motion. No accounts, health records, storage or AI calls.
(() => {
  const universe = document.querySelector('[data-home-universe]');
  if (!universe) return;

  const orbit = universe.querySelector('[data-home-orbit]');
  const logo = universe.querySelector('[data-home-logo]');
  const motionButton = universe.querySelector('[data-home-motion]');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  let paused = false;
  let visible = true;
  let frame = 0;

  function resetTilt() {
    cancelAnimationFrame(frame);
    frame = 0;
    logo.style.removeProperty('--home-tilt-x');
    logo.style.removeProperty('--home-tilt-y');
  }

  function syncMotion() {
    const stopped = paused || reducedMotion.matches || document.hidden || !visible;
    universe.classList.toggle('home-motion-paused', stopped);
    motionButton.hidden = reducedMotion.matches;
    motionButton.textContent = paused ? 'Resume animation' : 'Pause animation';
    if (stopped) resetTilt();
  }

  motionButton.addEventListener('click', () => { paused = !paused; syncMotion(); });
  reducedMotion.addEventListener('change', syncMotion);
  finePointer.addEventListener('change', resetTilt);
  document.addEventListener('visibilitychange', syncMotion);
  orbit.addEventListener('pointermove', event => {
    if (paused || reducedMotion.matches || !finePointer.matches || !visible || document.hidden) return;
    const bounds = orbit.getBoundingClientRect();
    const x = Math.max(-1, Math.min(1, (event.clientX - bounds.left) / bounds.width * 2 - 1));
    const y = Math.max(-1, Math.min(1, (event.clientY - bounds.top) / bounds.height * 2 - 1));
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      logo.style.setProperty('--home-tilt-x', `${-y * 6}deg`);
      logo.style.setProperty('--home-tilt-y', `${x * 8}deg`);
      frame = 0;
    });
  });
  orbit.addEventListener('pointerleave', resetTilt);
  orbit.addEventListener('pointercancel', resetTilt);
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
      syncMotion();
    });
    observer.observe(universe);
  }
  universe.classList.add('home-motion-ready');
  syncMotion();
})();

// The native disclosure stays usable without JavaScript.
(() => {
  const menu = document.querySelector('[data-home-menu]');
  if (!menu) return;
  const summary = menu.querySelector('summary');
  menu.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !menu.open) return;
    menu.open = false;
    summary.focus();
    event.preventDefault();
  });
  document.addEventListener('click', event => {
    if (!menu.open) return;
    if (!menu.contains(event.target) || event.target.closest('a')) menu.open = false;
  });
})();
