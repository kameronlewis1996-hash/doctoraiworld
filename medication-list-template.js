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
  const form = document.getElementById('medicine-name-search');
  const input = document.getElementById('medicine-name-query');
  const status = document.getElementById('medicine-name-search-status');
  const results = document.getElementById('medicine-name-search-results');
  if (!form || !input || !status || !results) return;

  const medicineSearch = window.DoctorAIMedicineCatalogSearch;
  if (!medicineSearch) {
    status.textContent = 'The Pharmac medicine search is unavailable. You can still use the blank template.';
    return;
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    results.replaceChildren();
    const query = medicineSearch.normalise(input.value);
    if (query.length < 2) {
      status.textContent = 'Enter at least two characters from a medicine name, ingredient, strength, or Pharmac code.';
      input.focus();
      return;
    }

    status.textContent = 'Searching the Pharmac product and ingredient list stored on this site…';
    try {
      const catalogue = await medicineSearch.load();
      const { matches, totalMatches } = medicineSearch.search(catalogue, query, 20);
      matches.forEach(record => {
        const product = record.product;
        const ingredientSummary = medicineSearch.ingredientSummary(record);
        const item = document.createElement('li');
        item.className = 'medicine-catalogue-result';
        const title = document.createElement('h3');
        title.className = 'medicine-catalogue-result-title';
        title.textContent = product.name;

        const detail = document.createElement('p');
        detail.className = 'medicine-catalogue-result-detail';
        const fields = [];
        if (product.chemical) fields.push('Chemical name: ' + product.chemical);
        if (product.formulation) fields.push('Form/strength: ' + product.formulation);
        detail.textContent = fields.join(' · ');

        const ingredients = document.createElement('p');
        ingredients.className = 'medicine-catalogue-result-ingredients';
        ingredients.textContent = ingredientSummary.complete
          ? 'Catalogue ingredient mapping: ' + ingredientSummary.names.join(', ')
          : ingredientSummary.hasPartialMapping
            ? 'Partial catalogue ingredient mapping: ' + ingredientSummary.names.join(', ') + '. Other ingredients may be missing.'
            : 'Active ingredients are incomplete in this catalogue record.';

        const identifiers = document.createElement('p');
        identifiers.className = 'medicine-catalogue-result-identifiers';
        const identifierParts = [];
        if (Array.isArray(product.schedules) && product.schedules.length) identifierParts.push('Schedule: ' + product.schedules.join(', '));
        if (Array.isArray(product.pharmacodes) && product.pharmacodes.length) identifierParts.push('Pharmac code: ' + product.pharmacodes.join(', '));
        if (Array.isArray(product.nzmtIds) && product.nzmtIds.length) identifierParts.push('NZMT: ' + product.nzmtIds.join(', '));
        if (product.section29) identifierParts.push('Section 29 listing');
        identifiers.textContent = identifierParts.join(' · ');

        const copy = document.createElement('button');
        copy.type = 'button';
        copy.className = 'medicine-name-copy';
        copy.textContent = 'Copy name';
        copy.addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(product.name);
            status.textContent = 'Copied the name. Check it against your package before adding it to your list.';
          } catch {
            status.textContent = 'Select the matching product name above and copy it to your list. Your search is not saved or sent.';
          }
        });
        item.append(title);
        if (detail.textContent) item.append(detail);
        item.append(ingredients);
        if (identifiers.textContent) item.append(identifiers);
        item.append(copy);
        results.append(item);
      });

      if (totalMatches === 0) {
        status.textContent = 'No matching product was found in this Pharmac dataset. Try a brand, ingredient, part of the name, formulation, strength, or Pharmac code. A missing result does not prove a medicine is unlisted.';
      } else if (totalMatches > matches.length) {
        status.textContent = `Showing the first ${matches.length} of ${totalMatches} matches. Add more search terms to narrow the results.`;
      } else {
        status.textContent = `Found ${totalMatches} matching ${totalMatches === 1 ? 'product' : 'products'}. Check the exact product and ingredients against the package label.`;
      }
    } catch (error) {
      status.textContent = error.message || 'The public name list could not be loaded. You can still use the blank template.';
    }
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
