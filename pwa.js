(() => {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => navigator.serviceWorker.register('/service-worker.js?v=16', { scope: '/', updateViaCache: 'none' }).then(registration => registration.update()).catch(() => {}));
  let hasController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // A worker can activate while someone is editing a health record. Reloading
    // here would silently discard an unsaved form. The first controller is just
    // the initial install; later updates can wait for a user-chosen refresh.
    if (!hasController) { hasController = true; return; }
    if (!document.querySelector('#hub-shell') || document.querySelector('[data-pwa-update-notice]')) return;
    const notice = document.createElement('div');
    notice.className = 'install-help';
    notice.dataset.pwaUpdateNotice = 'true';
    notice.setAttribute('role', 'status');
    notice.textContent = 'DoctorAI has an update. Save any edits, then refresh this page to use it.';
    document.body.appendChild(notice);
  });
  let installEvent;
  let helpTimer;
  const showInstallHelp = () => {
    let help = document.querySelector('[data-install-help]');
    if (!help) {
      help = document.createElement('div');
      help.className = 'install-help';
      help.dataset.installHelp = 'true';
      help.setAttribute('role', 'status');
      document.body.appendChild(help);
    }
    help.innerHTML = '<strong>Install the DoctorAI web app</strong><span>Android: open your browser menu and choose “Install app” or “Add to home screen”. iPhone: tap Share, then “Add to Home Screen”. Native App Store and Google Play releases are still coming soon.</span>';
    help.hidden = false;
    clearTimeout(helpTimer);
    helpTimer = setTimeout(() => { help.hidden = true; }, 9000);
  };
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installEvent = event; });
  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-install-app]');
    if (!button) return;
    if (!installEvent) { showInstallHelp(); return; }
    installEvent.prompt();
    await installEvent.userChoice.catch(() => null);
    installEvent = null;
  });
  window.addEventListener('appinstalled', () => {
    installEvent = null;
    document.querySelectorAll('[data-install-app]').forEach(item => { item.textContent = 'DoctorAI is installed'; item.disabled = true; });
  });
})();
