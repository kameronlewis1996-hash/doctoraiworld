(function () {
  'use strict';

  const start = () => {
    if (document.querySelector('.hub-shell') || document.body.matches('[data-staff-page], .mobile-auth-page')) return;

    const path = location.pathname.replace(/\.html$/, '') || '/';
    const page = path === '/research' ? 'research' : path === '/subscription' ? 'pro' : path === '/download' ? 'download' : '';
    const validHubViews = ['today', 'ask', 'health', 'profile', 'symptoms', 'medications', 'appointments', 'results', 'timeline', 'documents'];
    let returnView = 'today';
    try {
      const storedView = sessionStorage.getItem('doctorai-last-hub-view');
      if (validHubViews.includes(storedView)) returnView = storedView;
    } catch {}
    const returnHref = `/health-hub#${returnView}`;
    document.body.classList.add('doctorai-public-page');
    document.body.dataset.sitePage = page;

    const header = document.createElement('header');
    header.className = 'doctorai-site-header';
    header.innerHTML = `
      <div class="doctorai-site-header-inner">
        <a class="doctorai-site-brand" href="${returnHref}" aria-label="DoctorAI Health Hub">
          <img src="/doctorai-public-logo-transparent.png?v=10" alt="DoctorAI">
        </a>
        <button class="doctorai-site-menu-button" type="button" aria-expanded="false" aria-controls="doctorai-site-menu" aria-label="Open main menu">
          <span></span><span></span><span></span>
        </button>
        <nav class="doctorai-site-menu" id="doctorai-site-menu" aria-label="Main navigation">
          <a data-site-nav="home" href="/">Home</a>
          <a href="/#how-it-works">How it works</a>
          <a data-site-nav="hub" href="/health-hub#summary">Visit preparation</a>
          <a data-site-nav="pro" href="/subscription">Pro</a>
          <a href="/health-hub#profile">Sign in</a>
          <a class="doctorai-site-primary" href="/health-hub#summary">Build a visit brief <span aria-hidden="true">→</span></a>
        </nav>
      </div>`;

    const footer = document.createElement('footer');
    footer.className = 'doctorai-site-footer';
    footer.innerHTML = `
      <div class="doctorai-site-footer-inner">
        <a class="doctorai-site-footer-brand" href="${returnHref}"><img src="/doctorai-head-logo-transparent.png?v=10" alt=""><span><b>DoctorAI</b><small>Personal health organisation</small></span></a>
        <p>For education and organisation only — DoctorAI does not diagnose, prescribe, or replace professional medical care.</p>
        <nav aria-label="Resources, legal, support and social"><a href="/appointment-checklist">Free visit checklist</a><a href="/medication-list-template">Medicine list template</a><a href="/research">Research</a><a href="/download">Get the app</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="mailto:support@doctoraiworld.com">Support</a><a href="https://www.linkedin.com/company/doctoraiworld/" target="_blank" rel="noopener noreferrer" aria-label="Follow DoctorAI World on LinkedIn (opens in a new tab)">LinkedIn</a></nav>
      </div>`;

    document.body.prepend(header);
    document.body.append(footer);
    const main = document.querySelector('main');
    if (main) {
      if (!main.id) main.id = 'main-content';
      main.tabIndex = -1;
      const skip = document.createElement('a');
      skip.className = 'doctorai-skip-link';
      skip.href = `#${main.id}`;
      skip.textContent = 'Skip to main content';
      skip.addEventListener('click', () => main.focus());
      document.body.prepend(skip);
    }

    const current = header.querySelector(`[data-site-nav="${page}"]`);
    if (current) current.setAttribute('aria-current', 'page');

    const button = header.querySelector('.doctorai-site-menu-button');
    const menu = header.querySelector('.doctorai-site-menu');
    const closeMenu = () => {
      header.classList.remove('menu-open');
      button.setAttribute('aria-expanded', 'false');
      button.setAttribute('aria-label', 'Open main menu');
    };
    button.addEventListener('click', () => {
      const open = !header.classList.contains('menu-open');
      header.classList.toggle('menu-open', open);
      button.setAttribute('aria-expanded', String(open));
      button.setAttribute('aria-label', open ? 'Close main menu' : 'Open main menu');
      if (open) menu.querySelector('a')?.focus({ preventScroll: true });
    });
    menu.addEventListener('click', event => { if (event.target.closest('a')) closeMenu(); });
    document.addEventListener('click', event => { if (!header.contains(event.target)) closeMenu(); });
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || !header.classList.contains('menu-open')) return;
      closeMenu();
      button.focus();
    });
    matchMedia('(min-width: 821px)').addEventListener?.('change', closeMenu);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
