// Preserve old root hash links without sending new visitors past the introduction.
(() => {
  const legacyViews = ['today','ask','health','profile','symptoms','medications','appointments','results','timeline','documents','summary'];
  if (legacyViews.includes(location.hash.slice(1))) location.replace('/health-hub' + location.hash);
})();

// A local, illustrative tour. No accounts, health records, storage or AI calls.
(() => {
  const universe = document.querySelector('[data-home-universe]');
  if (!universe) return;

  const topics = {
    today: { title: 'Your day, at a glance.', copy: 'See the medicines, appointments and tasks you have recorded for today.', label: 'Open Today', href: '/health-hub#today' },
    health: { title: 'Your health details, together.', copy: 'Review the details you have saved and find your health tools in one place.', label: 'Open My Health', href: '/health-hub#health' },
    visit: { title: 'Your next conversation, prepared.', copy: 'Choose saved details, add your questions and review your personal brief before you copy or print it.', label: 'Open Visit Prep', href: '/health-hub#visit-prep' },
    profile: { title: 'Your information. Your choices.', copy: 'Manage your account, storage preferences, privacy and optional Health Memory controls.', label: 'Open Profile', href: '/health-hub#profile' }
  };
  const buttons = [...universe.querySelectorAll('[data-home-topic]')];
  const title = universe.querySelector('[data-home-topic-title]');
  const copy = universe.querySelector('[data-home-topic-copy]');
  const link = universe.querySelector('[data-home-topic-link]');

  buttons.forEach(button => {
    button.addEventListener('click', () => {
      const topic = topics[button.dataset.homeTopic];
      if (!topic) return;
      universe.dataset.homeTheme = button.dataset.homeTopic;
      buttons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      title.textContent = topic.title;
      copy.textContent = topic.copy;
      link.firstChild.textContent = topic.label + ' ';
      link.href = topic.href;
    });
  });
  universe.querySelector('[data-home-topics]').hidden = false;
  universe.querySelector('[data-home-tour-hint]').hidden = false;

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
