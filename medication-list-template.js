document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('print-template')?.addEventListener('click', () => window.print());
  document.getElementById('download-csv')?.addEventListener('click', () => {
    const csv = '\uFEFFName as shown on label,Strength or form shown on label,What I take it for,Directions shown on label,Questions for my care team\r\n';
    const file = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'medication-list-template.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
});

document.addEventListener('DOMContentLoaded', () => {
  const allowButton = document.getElementById('measurement-allow');
  const declineButton = document.getElementById('measurement-decline');
  const status = document.getElementById('measurement-status');
  if (!allowButton || !declineButton || !status) return;

  const canonicalURL = 'https://www.doctoraiworld.com/medication-list-template';
  const publicReferrerOrigins = new Set([
    'https://www.google.com',
    'https://www.google.co.nz',
    'https://www.bing.com',
    'https://doctoraiworld.com',
    'https://www.doctoraiworld.com'
  ]);
  let measurementAllowed = false;
  let measurementStarted = false;
  let viewRequested = false;

  function browserRequestsPrivacy() {
    return navigator.globalPrivacyControl === true ||
      [navigator.doNotTrack, window.doNotTrack, navigator.msDoNotTrack]
        .some(value => ['1', 'yes'].includes(String(value).toLowerCase()));
  }

  function contextAllowsMeasurement() {
    try {
      if (browserRequestsPrivacy() ||
          location.origin !== 'https://www.doctoraiworld.com' ||
          location.pathname !== '/medication-list-template' ||
          '__va_attribution' in window.localStorage) return false;

      if (!document.referrer) return true;
      const referrer = new URL(document.referrer);
      return publicReferrerOrigins.has(referrer.origin) &&
        referrer.pathname === '/' && !referrer.search && !referrer.hash &&
        !referrer.username && !referrer.password;
    } catch {
      return false;
    }
  }

  function analyticsAlreadyPresent() {
    return typeof window.va !== 'undefined' ||
      typeof window.vaq !== 'undefined' ||
      typeof window.vai !== 'undefined';
  }

  declineButton.disabled = false;
  if (contextAllowsMeasurement() && !analyticsAlreadyPresent()) {
    allowButton.disabled = false;
  } else {
    status.textContent = browserRequestsPrivacy()
      ? 'Your browser’s privacy preference keeps page counting off.'
      : 'Page counting stays off for this visit to protect privacy.';
  }

  declineButton.addEventListener('click', () => {
    measurementAllowed = false;
    allowButton.disabled = true;
    declineButton.disabled = true;
    status.textContent = 'Page counting stays off for this visit. Your choice is not saved.';
  });

  allowButton.addEventListener('click', () => {
    allowButton.disabled = true;
    declineButton.disabled = true;
    if (measurementStarted || analyticsAlreadyPresent() || !contextAllowsMeasurement()) {
      status.textContent = 'Page counting could not start safely and remains off.';
      return;
    }

    measurementAllowed = true;
    measurementStarted = true;
    try {
      window.vaq = [];
      window.va = function () { window.vaq.push(arguments); };
      window.va('beforeSend', event => {
        if (!measurementAllowed || viewRequested || event.type !== 'pageview') return null;
        if (!contextAllowsMeasurement()) {
          measurementAllowed = false;
          status.textContent = 'Page counting stays off for this visit to protect privacy.';
          return null;
        }
        viewRequested = true;
        return { type: 'pageview', url: canonicalURL };
      });

      const script = document.createElement('script');
      script.src = '/_vercel/insights/script.js';
      script.async = true;
      script.referrerPolicy = 'no-referrer';
      script.addEventListener('error', () => {
        measurementAllowed = false;
        status.textContent = 'Page counting could not start and remains off. You can keep using this resource.';
      });
      status.textContent = 'You have allowed a page count for this visit. Your choice is not saved.';
      document.head.appendChild(script);
    } catch {
      measurementAllowed = false;
      status.textContent = 'Page counting could not start and remains off. You can keep using this resource.';
    }
  });
});
