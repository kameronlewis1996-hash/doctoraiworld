(() => {
  'use strict';
  const status = document.querySelector('#status');
  const fallback = document.querySelector('#fallback');
  const button = document.querySelector('#google-button');
  const query = new URLSearchParams(location.search);
  const state = String(query.get('state') || '');
  const returnTo = String(query.get('return') || 'doctorai://auth');
  const validState = /^[A-Za-z0-9_-]{24,160}$/.test(state);
  const validReturn = returnTo === 'doctorai://auth';
  const setStatus = (message, error = false) => { status.textContent = message; status.classList.toggle('error', error); };
  const fail = message => { setStatus(message, true); fallback.style.display = 'block'; };
  const complete = token => {
    const next = new URL(returnTo);
    next.searchParams.set('state', state);
    next.searchParams.set('token', token);
    location.assign(next.toString());
  };
  async function credential(response) {
    if (!response?.credential) return fail('Google sign-in was cancelled.');
    setStatus('Creating your secure mobile session…');
    try {
      const result = await fetch('/api/auth/mobile', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ credential: response.credential, state }) });
      const payload = await result.json().catch(() => ({}));
      if (!result.ok || !payload.accessToken) throw new Error(payload.error || 'Secure mobile sign-in could not be completed.');
      complete(payload.accessToken);
    } catch (error) {
      fail(error instanceof Error ? error.message : 'Secure mobile sign-in could not be completed.');
    }
  }
  async function initialise() {
    if (!validState || !validReturn) return fail('This sign-in request is invalid. Return to the DoctorAI app and try again.');
    try {
      const response = await fetch('/api/auth/config', { headers: { accept: 'application/json' } });
      const config = response.ok ? await response.json() : {};
      const clientId = String(config.googleClientId || '').trim();
      if (!clientId) return fail('Google sign-in is not configured yet.');
      const waitForGoogle = () => {
        if (!window.google?.accounts?.id) return window.setTimeout(waitForGoogle, 100);
        window.google.accounts.id.initialize({ client_id: clientId, callback: credential, cancel_on_tap_outside: true });
        window.google.accounts.id.renderButton(button, { theme: 'outline', size: 'large', text: 'continue_with', shape: 'rectangular', width: 280 });
        setStatus('Continue with Google to open your private mobile health hub.');
      };
      waitForGoogle();
    } catch {
      fail('Google sign-in could not be loaded. Check your connection and try again.');
    }
  }
  initialise();
})();
