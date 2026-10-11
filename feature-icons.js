(function () {
  'use strict';

  // Small, original DoctorAI symbols: one clear idea per feature, with the
  // familiar soft-filled line treatment used throughout the Health Hub.
  const artwork = {
    spark: '<svg aria-hidden="true" viewBox="0 0 24 24"><path class="icon-fill" d="M12 2.8c.7 5 3.4 7.7 8.4 8.4-5 .7-7.7 3.4-8.4 8.4-.7-5-3.4-7.7-8.4-8.4 5-.7 7.7-3.4 8.4-8.4Z"/><path d="M12 2.8c.7 5 3.4 7.7 8.4 8.4-5 .7-7.7 3.4-8.4 8.4-.7-5-3.4-7.7-8.4-8.4 5-.7 7.7-3.4 8.4-8.4Z"/><path d="M19.4 3.1v3.2M21 4.7h-3.2M3.3 17v3.1M4.9 18.6H1.8"/></svg>',
    capsule: '<svg aria-hidden="true" viewBox="0 0 24 24"><path class="icon-fill" d="M5.2 18.8a4.8 4.8 0 0 1 0-6.8l6.8-6.8a4.8 4.8 0 0 1 6.8 6.8L12 18.8a4.8 4.8 0 0 1-6.8 0Z"/><path d="M5.2 18.8a4.8 4.8 0 0 1 0-6.8l6.8-6.8a4.8 4.8 0 0 1 6.8 6.8L12 18.8a4.8 4.8 0 0 1-6.8 0Z"/><path d="m8.7 8.7 6.6 6.6M17.9 3.3v3M19.4 4.8h-3"/></svg>',
    calendar: '<svg aria-hidden="true" viewBox="0 0 24 24"><rect class="icon-fill" x="3.5" y="5" width="17" height="16" rx="3"/><rect x="3.5" y="5" width="17" height="16" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17"/><path d="m8.2 15.3 2.1 2.1 4.7-4.7"/></svg>',
    document: '<svg aria-hidden="true" viewBox="0 0 24 24"><path class="icon-fill" d="M6 3.5h8l4 4v13H6z"/><path d="M6 3.5h8l4 4v13H6zM14 3.5v4h4M9 12h6M9 15.5h6M9 19h3"/><path d="M4 6v15h12"/></svg>',
    carePack: '<svg aria-hidden="true" viewBox="0 0 24 24"><path class="icon-fill" d="M6 3.5h8l4 4v13H6z"/><path d="M6 3.5h8l4 4v13H6zM14 3.5v4h4M9 12h4M9 15.5h3"/><path d="m17.3 13.4.9 1.9 2 .3-1.5 1.4.4 2-1.8-1-1.8 1 .4-2-1.5-1.4 2-.3.9-1.9Z"/></svg>',
    memory: '<svg aria-hidden="true" viewBox="0 0 24 24"><path class="icon-fill" d="M6 4.5h12a2 2 0 0 1 2 2v13l-8-4-8 4v-13a2 2 0 0 1 2-2Z"/><path d="M6 4.5h12a2 2 0 0 1 2 2v13l-8-4-8 4v-13a2 2 0 0 1 2-2Z"/><path d="M12 7v5M9.5 9.5h5"/></svg>',
    pulse: '<svg aria-hidden="true" viewBox="0 0 24 24"><rect class="icon-fill" x="3" y="4" width="18" height="16" rx="4"/><rect x="3" y="4" width="18" height="16" rx="4"/><path d="M5.5 12h3l2-4.5 3.2 9 2.1-4.5h2.7"/></svg>',
    chart: '<svg aria-hidden="true" viewBox="0 0 24 24"><path class="icon-fill" d="M4 19.5V13l5-5 4 3 6-7v15.5z"/><path d="M4 19.5V5M4 19.5h16M7 16l3.5-4 3 2 5-7"/><circle class="icon-solid" cx="18.5" cy="7" r="1.2"/></svg>',
    timeline: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M7 4v16"/><circle class="icon-fill" cx="7" cy="6" r="2.5"/><circle cx="7" cy="6" r="2.5"/><circle class="icon-fill" cx="7" cy="12" r="2.5"/><circle cx="7" cy="12" r="2.5"/><circle class="icon-fill" cx="7" cy="18" r="2.5"/><circle cx="7" cy="18" r="2.5"/><path d="M12 6h6M12 12h8M12 18h5"/></svg>',
    research: '<svg aria-hidden="true" viewBox="0 0 24 24"><path class="icon-fill" d="M12 6.5c-2-2-5-2.5-8-1.5v13c3-1 6-.5 8 1.5 2-2 5-2.5 8-1.5V5c-3-1-6-.5-8 1.5Z"/><path d="M12 6.5c-2-2-5-2.5-8-1.5v13c3-1 6-.5 8 1.5 2-2 5-2.5 8-1.5V5c-3-1-6-.5-8 1.5ZM12 6.5v13"/><path d="M6.5 9h3M6.5 12h3M14.5 9h3M14.5 12h3"/></svg>',
    scan: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M8 4H5a1 1 0 0 0-1 1v3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><path class="icon-fill" d="M8 11.5a4 4 0 0 1 8 0v1a4 4 0 0 1-8 0z"/><path d="M8 11.5a4 4 0 0 1 8 0v1a4 4 0 0 1-8 0zM10 12h4"/></svg>',
    add: '<svg aria-hidden="true" viewBox="0 0 24 24"><circle class="icon-fill" cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="9"/><path d="M12 7v10M7 12h10"/></svg>',
    home: '<svg aria-hidden="true" viewBox="0 0 24 24"><path class="icon-fill" d="m3.5 10.5 8.5-7 8.5 7v9a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z"/><path d="m3.5 10.5 8.5-7 8.5 7v9a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5zM9 21v-5a3 3 0 0 1 6 0v5"/><path d="M12 8v4M10 10h4"/></svg>',
    today: '<svg aria-hidden="true" viewBox="0 0 24 24"><path class="icon-fill" d="M4 17a8 8 0 0 1 16 0z"/><path d="M3 18h18M5 14a7 7 0 0 1 14 0M12 3v3M4.9 6l2.2 2.2M19.1 6l-2.2 2.2M3 11h3M18 11h3"/></svg>',
    chat: '<svg aria-hidden="true" viewBox="0 0 24 24"><path class="icon-fill" d="M4 5.5h16v12H11l-5 3v-3H4z"/><path d="M4 5.5h16v12H11l-5 3v-3H4z"/><path d="m12.7 8.2.8 1.8 1.9.3-1.4 1.3.4 1.9-1.7-.9-1.7.9.4-1.9L10 10.3l1.9-.3.8-1.8Z"/></svg>',
    overview: '<svg aria-hidden="true" viewBox="0 0 24 24"><rect class="icon-fill" x="4" y="4" width="16" height="16" rx="3"/><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 8h8M8 12h5M8 16h3M16 13.5l1 1 2-2"/></svg>',
    provider: '<svg aria-hidden="true" viewBox="0 0 24 24"><path class="icon-fill" d="M12 21s7-6 7-12a7 7 0 1 0-14 0c0 6 7 12 7 12Z"/><path d="M12 21s7-6 7-12a7 7 0 1 0-14 0c0 6 7 12 7 12Z"/><circle cx="12" cy="9" r="2.2"/><path d="M8.8 14.5a3.2 3.2 0 0 1 6.4 0"/></svg>',
    alert: '<svg aria-hidden="true" viewBox="0 0 24 24"><path class="icon-fill" d="m12 3 9 16H3z"/><path d="m12 3 9 16H3zM12 9v4M12 16.5v.1"/></svg>',
    shield: '<svg aria-hidden="true" viewBox="0 0 24 24"><path class="icon-fill" d="M12 3 20 6v5c0 5-3.3 8.5-8 10-4.7-1.5-8-5-8-10V6z"/><path d="M12 3 20 6v5c0 5-3.3 8.5-8 10-4.7-1.5-8-5-8-10V6zM12 8v7M8.5 11.5h7"/></svg>',
    refill: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M19 8a8 8 0 0 0-13.8-2L4 8M5 16a8 8 0 0 0 13.8 2L20 16"/><path d="M4 4v4h4M20 20v-4h-4"/><path class="icon-fill" d="M9 9h6v6H9z"/><path d="M9 9h6v6H9zM12 10.5v3M10.5 12h3"/></svg>',
    search: '<svg aria-hidden="true" viewBox="0 0 24 24"><circle class="icon-fill" cx="10.8" cy="10.8" r="6.8"/><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5M8.4 10.8h4.8M10.8 8.4v4.8"/></svg>',
    clock: '<svg viewBox="0 0 24 24"><circle class="icon-fill" cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/></svg>',
    location: '<svg viewBox="0 0 24 24"><path class="icon-fill" d="M12 21s7-6 7-12a7 7 0 1 0-14 0c0 6 7 12 7 12Z"/><path d="M12 21s7-6 7-12a7 7 0 1 0-14 0c0 6 7 12 7 12Z"/><circle cx="12" cy="9" r="2.3"/></svg>',
    health: '<svg viewBox="0 0 24 24"><path class="icon-fill" d="M12 20 4.6 12.8a5.1 5.1 0 0 1 7.4-7 5.1 5.1 0 0 1 7.4 7Z"/><path d="M12 20 4.6 12.8a5.1 5.1 0 0 1 7.4-7 5.1 5.1 0 0 1 7.4 7Z"/></svg>',
    person: '<svg viewBox="0 0 24 24"><circle class="icon-fill" cx="12" cy="7" r="3.5"/><circle cx="12" cy="7" r="3.5"/><path class="icon-fill" d="M5 21v-3a7 7 0 0 1 14 0v3Z"/><path d="M5 21v-3a7 7 0 0 1 14 0v3"/></svg>',
    drop: '<svg viewBox="0 0 24 24"><path class="icon-fill" d="M12 3c-2 3-6.5 7.1-6.5 11a6.5 6.5 0 0 0 13 0C18.5 10.1 14 6 12 3Z"/><path d="M12 3c-2 3-6.5 7.1-6.5 11a6.5 6.5 0 0 0 13 0C18.5 10.1 14 6 12 3ZM9 14.5a3 3 0 0 0 3 3"/></svg>',
    allergy: '<svg viewBox="0 0 24 24"><path class="icon-fill" d="M12 3 20 6v5c0 5-3.3 8.5-8 10-4.7-1.5-8-5-8-10V6Z"/><path d="M12 3 20 6v5c0 5-3.3 8.5-8 10-4.7-1.5-8-5-8-10V6ZM12 8v5M12 16v.1"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></svg>',
    chevronDown: '<svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>',
    arrow: '<svg viewBox="0 0 24 24"><path d="M4 12h16m-6-6 6 6-6 6"/></svg>',
    arrowLeft: '<svg viewBox="0 0 24 24"><path d="M20 12H4m6-6-6 6 6 6"/></svg>',
    upload: '<svg viewBox="0 0 24 24"><path class="icon-fill" d="M4 14v6h16v-6Z"/><path d="M4 14v6h16v-6M12 16V3m-5 5 5-5 5 5"/></svg>',
    download: '<svg viewBox="0 0 24 24"><path class="icon-fill" d="M4 14v6h16v-6Z"/><path d="M4 14v6h16v-6M12 3v13m-5-5 5 5 5-5"/></svg>',
    phone: '<svg viewBox="0 0 24 24"><rect class="icon-fill" x="6" y="2.5" width="12" height="19" rx="2.5"/><rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M10 6h4M11 18h2"/></svg>',
    settings: '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16"/><circle class="icon-fill" cx="8" cy="6" r="2"/><circle cx="8" cy="6" r="2"/><circle class="icon-fill" cx="16" cy="12" r="2"/><circle cx="16" cy="12" r="2"/><circle class="icon-fill" cx="10" cy="18" r="2"/><circle cx="10" cy="18" r="2"/></svg>',
    link: '<svg viewBox="0 0 24 24"><path d="m9 15 6-6M9.5 7.5l2-2a5 5 0 0 1 7 7l-2 2M14.5 16.5l-2 2a5 5 0 0 1-7-7l2-2"/></svg>',
    printer: '<svg viewBox="0 0 24 24"><path class="icon-fill" d="M4 9h16v8H4Z"/><path d="M7 9V3h10v6M7 17H4V9h16v8h-3M7 14h10v7H7Z"/><circle class="icon-solid" cx="17" cy="12" r=".7"/></svg>',
    share: '<svg viewBox="0 0 24 24"><path d="m8 10 8-4M8 14l8 4"/><circle class="icon-fill" cx="5" cy="12" r="3"/><circle cx="5" cy="12" r="3"/><circle class="icon-fill" cx="19" cy="4.5" r="2.5"/><circle cx="19" cy="4.5" r="2.5"/><circle class="icon-fill" cx="19" cy="19.5" r="2.5"/><circle cx="19" cy="19.5" r="2.5"/></svg>',
    external: '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M10 4H4v16h16v-6"/></svg>',
    refresh: '<svg viewBox="0 0 24 24"><path d="M20 7v5h-5M4 17v-5h5M6.3 7a7 7 0 0 1 11.5-1L20 9M4 15l2.2 3a7 7 0 0 0 11.5-1"/></svg>',
    info: '<svg viewBox="0 0 24 24"><circle class="icon-fill" cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v.1"/></svg>',
    folder: '<svg viewBox="0 0 24 24"><path class="icon-fill" d="M3 7h7l2-3h8v16H3Z"/><path d="M3 7h7l2-3h8v16H3ZM3 10h17"/></svg>',
    clipboard: '<svg viewBox="0 0 24 24"><rect class="icon-fill" x="5" y="5" width="14" height="16" rx="2"/><path d="M9 5H5v16h14V5h-4M9 3h6v4H9ZM9 12h6M9 16h4"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="m5 12 4.5 4.5L19 7"/></svg>'
  };

  // Health Hub action marks use a dedicated set so marketing and research
  // feature artwork retains its established symbols.
  const hubArtwork = {
    hubHome: '<svg aria-hidden="true" viewBox="0 0 24 24"><path class="icon-fill" d="m4 10.2 8-6.3 8 6.3v8a1.8 1.8 0 0 1-1.8 1.8H5.8A1.8 1.8 0 0 1 4 18.2z"/><path d="m4 10.2 8-6.3 8 6.3v8a1.8 1.8 0 0 1-1.8 1.8H5.8A1.8 1.8 0 0 1 4 18.2zM8.2 20v-4.4a3.8 3.8 0 0 1 7.6 0V20"/><path d="M8.1 12.4h2l1.1-2.1 1.8 4.7 1.2-2.6h1.7"/></svg>',
    hubMedicationScan: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M7.5 4H5.8A1.8 1.8 0 0 0 4 5.8v1.7M16.5 4h1.7A1.8 1.8 0 0 1 20 5.8v1.7M20 16.5v1.7a1.8 1.8 0 0 1-1.8 1.8h-1.7M7.5 20H5.8A1.8 1.8 0 0 1 4 18.2v-1.7"/><path class="icon-fill" d="M9 8V6.2h6V8l1.6 1.7v8.1a1.8 1.8 0 0 1-1.8 1.8h-5.6a1.8 1.8 0 0 1-1.8-1.8V9.7z"/><path d="M9 8V6.2h6V8l1.6 1.7v8.1a1.8 1.8 0 0 1-1.8 1.8h-5.6a1.8 1.8 0 0 1-1.8-1.8V9.7zM9 12h6M11 15h2M10.5 4.2h3"/></svg>',
    hubAddDetails: '<svg aria-hidden="true" viewBox="0 0 24 24"><path class="icon-fill" d="M5 3.5h8l3.5 3.6v12.4H5z"/><path d="M5 3.5h8l3.5 3.6v12.4H5zM13 3.5v3.6h3.5M8 10.5h5.8M8 13.5h4"/><circle class="icon-fill" cx="17.5" cy="17.5" r="4"/><circle cx="17.5" cy="17.5" r="4"/><path d="M17.5 15.5v4M15.5 17.5h4"/></svg>',
    hubVisitPrep: '<svg aria-hidden="true" viewBox="0 0 24 24"><rect class="icon-fill" x="3.5" y="4.5" width="17" height="16" rx="3"/><rect x="3.5" y="4.5" width="17" height="16" rx="3"/><path d="M8 3v4M16 3v4M3.5 9.5h17"/><circle class="icon-solid" cx="7.8" cy="13" r=".8"/><path d="M10.2 13h6M10.2 16.2h4.2M7.8 16.2l.7.7 1.3-1.4"/></svg>'
  };

  const artworkMarkup = (symbol, size) => {
    const template = document.createElement('template');
    template.innerHTML = hubArtwork[symbol] || artwork[symbol] || artwork.spark;
    const svg = template.content.firstElementChild;
    if (!svg) return '';
    svg.classList.add('doctorai-feature-mark');
    if (size === 'flex') {
      svg.setAttribute('width', '100%');
      svg.setAttribute('height', '100%');
    } else {
      const pixels = Math.max(12, Math.min(64, Number(size) || 20));
      svg.setAttribute('width', `${pixels}px`);
      svg.setAttribute('height', `${pixels}px`);
    }
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('data-doctorai-symbol', symbol);
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2.2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.querySelectorAll('.icon-fill').forEach(shape => {
      shape.setAttribute('fill', 'currentColor');
      shape.setAttribute('stroke', 'none');
      shape.setAttribute('opacity', '.18');
    });
    svg.querySelectorAll('.icon-solid').forEach(shape => {
      shape.setAttribute('fill', 'currentColor');
      shape.setAttribute('stroke', 'none');
    });
    return svg.outerHTML;
  };

  // Static pages and newly rendered menus use the same trusted symbol catalog.
  const hydrate = (root = document) => {
    const markers = [...root.querySelectorAll('[data-doctorai-icon]')];
    if (root.matches?.('[data-doctorai-icon]')) markers.unshift(root);
    markers.forEach(marker => {
      const name = marker.dataset.doctoraiIcon;
      const size = marker.dataset.iconSize || 20;
      const key = `${name}:${size}`;
      if (marker.dataset.doctoraiIconReady === key) return;
      marker.innerHTML = artworkMarkup(name, size);
      marker.dataset.doctoraiIconReady = key;
      marker.classList.add('doctorai-icon-slot');
      marker.setAttribute('aria-hidden', 'true');
    });
    const controlGlyphs = { '→': 'arrow', '←': 'arrowLeft', '↥': 'download', '↑': 'upload', '↻': 'refresh', '⌄': 'chevronDown', '×': 'close', '✓': 'check', '＋': 'add' };
    root.querySelectorAll('span[aria-hidden="true"], i[aria-hidden="true"]').forEach(marker => {
      const name = controlGlyphs[marker.textContent.trim()];
      if (!name || marker.querySelector('svg')) return;
      marker.innerHTML = artworkMarkup(name, 16);
      marker.classList.add('doctorai-icon-slot');
    });
  };
  window.DoctorAIIcons = Object.freeze({ markup: artworkMarkup, hydrate });

  const applyHubArtwork = () => {
    const replaceMark = (selector, tone, size, symbol = tone) => document.querySelectorAll(selector).forEach(icon => {
      const markup = artworkMarkup(symbol, size);
      if (icon.namespaceURI === 'http://www.w3.org/2000/svg' && icon.localName === 'svg') {
        const template = document.createElement('template');
        template.innerHTML = markup;
        icon.replaceWith(template.content.firstElementChild);
      } else {
        icon.dataset.doctoraiIcon = symbol;
        icon.dataset.iconSize = String(size);
        icon.classList.add('doctorai-icon-slot', 'tone-' + tone);
        icon.setAttribute('aria-hidden', 'true');
      }
    });

    const navMarks = [
      ['.primary-nav > .nav-item[data-view="health"] .nav-icon', 'cyan', 20, 'hubHome'],
      ['.primary-nav > .nav-item[data-open-medication-scanner] .nav-icon', 'blue', 20, 'hubMedicationScan'],
      ['.primary-nav > .nav-item[data-add-menu] .nav-icon', 'yellow', 20, 'hubAddDetails'],
      ['.primary-nav > .nav-item[data-open-summary] .nav-icon', 'violet', 20, 'hubVisitPrep'],
      ['.sidebar-more-toggle .nav-icon', 'yellow', 20, 'overview'],
      ['.sidebar-more-links [data-view="today"] .nav-icon', 'cyan', 20, 'today'],
      ['.sidebar-more-links [data-view="ask"] .nav-icon', 'cyan', 20, 'chat'],
      ['.sidebar-more-links [data-view="medications"] .nav-icon', 'blue', 20, 'capsule'],
      ['.sidebar-more-links [data-view="appointments"] .nav-icon', 'violet', 20, 'calendar'],
      ['.sidebar-more-links [data-view="symptoms"] .nav-icon', 'coral', 20, 'pulse'],
      ['.sidebar-more-links [data-view="results"] .nav-icon', 'yellow', 20, 'chart'],
      ['.sidebar-more-links [data-view="timeline"] .nav-icon', 'mint', 20, 'timeline'],
      ['.sidebar-more-links [data-view="documents"] .nav-icon', 'mint', 20, 'document'],
      ['.sidebar-more-links .research-nav-highlight .nav-icon', 'yellow', 20, 'research']
    ];
    navMarks.forEach(([selector, tone, size, symbol]) => replaceMark(selector, tone, size, symbol));

    const categoryMarks = [
      ['.category-bar [data-view="health"] > span:first-child', 'cyan', 17, 'hubHome'],
      ['.category-bar [data-open-medication-scanner] > span:first-child', 'blue', 17, 'hubMedicationScan'],
      ['.category-bar [data-add-menu] > span:first-child', 'yellow', 17, 'hubAddDetails'],
      ['.category-bar [data-open-summary] > span:first-child', 'violet', 17, 'hubVisitPrep'],
      ['.category-bar [data-more-menu] > span:first-child', 'yellow', 17, 'overview'],
      ['.category-more-menu [data-view="today"] > span:first-child', 'cyan', 16, 'today'],
      ['.category-more-menu [data-view="ask"] > span:first-child', 'cyan', 16, 'chat'],
      ['.category-more-menu [data-view="medications"] > span:first-child', 'blue', 16, 'capsule'],
      ['.category-more-menu [data-view="appointments"] > span:first-child', 'violet', 16, 'calendar'],
      ['.category-more-menu [data-view="symptoms"] > span:first-child', 'coral', 16, 'pulse'],
      ['.category-more-menu [data-view="results"] > span:first-child', 'yellow', 16, 'chart'],
      ['.category-more-menu [data-view="timeline"] > span:first-child', 'mint', 16, 'timeline'],
      ['.category-more-menu [data-view="documents"] > span:first-child', 'mint', 16, 'document'],
      ['.category-more-menu .research-nav-highlight > span:first-child', 'yellow', 16, 'research']
    ];
    categoryMarks.forEach(([selector, tone, size, symbol]) => replaceMark(selector, tone, size, symbol));

    const mobileMarks = [
      ['.mobile-bottom-nav [data-view="health"] > span', 'cyan', 22, 'hubHome'],
      ['.mobile-bottom-nav [data-open-medication-scanner] > span', 'blue', 22, 'hubMedicationScan'],
      ['.mobile-bottom-nav [data-add-menu] > span', 'yellow', 22, 'hubAddDetails'],
      ['.mobile-bottom-nav [data-open-summary] > span', 'violet', 22, 'hubVisitPrep'],
      ['.mobile-bottom-nav [data-view="medications"] > span', 'blue', 22, 'capsule']
    ];
    mobileMarks.forEach(([selector, tone, size, symbol]) => replaceMark(selector, tone, size, symbol));

    replaceMark('.sidebar-bottom .upgrade-icon', 'cyan', 17, 'spark');
    replaceMark('.sidebar-bottom .memory-mini-icon', 'mint', 17, 'memory');
    replaceMark('.topbar-actions .pro-button > span', 'cyan', 17, 'spark');
    replaceMark('.topbar-actions [data-add-menu] > span', 'yellow', 17, 'add');

    replaceMark('#view-health .care-visit-card > svg', 'violet', 48, 'hubVisitPrep');
    replaceMark('#view-health .memory-large-icon', 'mint', 20, 'memory');
    replaceMark('#view-health .personal-overview-icon', 'mint', 24, 'overview');
    replaceMark('#view-health .health-info-grid .info-icon.blue', 'blue', 17, 'health');
    replaceMark('#view-health .health-info-grid .info-icon.coral', 'coral', 17, 'alert');
    replaceMark('#view-health .health-info-grid .info-icon.purple', 'violet', 17, 'provider');
    replaceMark('#view-health .health-info-grid .info-icon.dark', 'yellow', 17, 'shield');

    replaceMark('#view-today .hub-ask-prompt-icon', 'cyan', 'flex', 'chat');
    replaceMark('#view-today .care-visit-card > svg', 'violet', 48, 'hubVisitPrep');
    replaceMark('#view-today .orbit-action-ask .orbit-action-icon', 'blue', 'flex', 'scan');
    replaceMark('#view-today .orbit-action-medicines .orbit-action-icon', 'coral', 'flex', 'pulse');
    replaceMark('#view-today .orbit-action-appointments .orbit-action-icon', 'violet', 'flex', 'calendar');
    replaceMark('#view-today .orbit-action-health .orbit-action-icon', 'mint', 'flex', 'document');
    replaceMark('#view-today .orbit-action-symptoms .orbit-action-icon', 'yellow', 'flex', 'chart');
    replaceMark('#view-today .orbit-action-research .orbit-action-icon', 'cyan', 'flex', 'overview');
    replaceMark('#view-today .daily-insight .insight-icon', 'cyan', 19, 'spark');
    replaceMark('#view-today .overview-stat:nth-child(1) .overview-icon', 'blue', 17, 'capsule');
    replaceMark('#view-today .overview-stat:nth-child(2) .overview-icon', 'violet', 17, 'calendar');
    replaceMark('#view-today .overview-stat:nth-child(3) .overview-icon', 'blue', 17, 'refill');
    replaceMark('#view-today .overview-stat:nth-child(4) .overview-icon', 'mint', 17, 'memory');
  };

  const apply = () => {
    const replace = (selector, tone, symbol) => document.querySelectorAll(selector).forEach(icon => {
      icon.innerHTML = artworkMarkup(symbol, 'flex');
      icon.classList.add('feature-icon', 'tone-' + tone);
      icon.setAttribute('aria-hidden', 'true');
    });
    replace('.preview-appointment > .preview-icon', 'violet', 'calendar');
    replace('.preview-grid > div:nth-child(1) > .preview-icon', 'mint', 'document');
    replace('.preview-grid > div:nth-child(2) > .preview-icon', 'cyan', 'memory');
    replace('.preview-grid > div:nth-child(3) > .preview-icon', 'blue', 'capsule');
    replace('.preview-grid > div:nth-child(4) > .preview-icon', 'yellow', 'chart');
    replace('[data-research-tab="highlights"] > span', 'cyan', 'research');
    replace('[data-research-tab="explore"] > span', 'yellow', 'search');
    replace('[data-research-tab="discuss"] > span', 'blue', 'chat');
    replace('.feature-card > .feature-icon.blue', 'cyan', 'carePack');
    replace('.feature-card > .feature-icon.purple', 'violet', 'calendar');
    replace('.feature-card > .feature-icon.orange', 'blue', 'document');
    replace('.feature-card > .feature-icon.green', 'mint', 'chart');
    applyHubArtwork();
    hydrate();
    const observer = new MutationObserver(records => {
      records.forEach(record => record.addedNodes.forEach(node => {
        if (node.nodeType === 1) hydrate(node);
      }));
    });
    observer.observe(document.body, { childList: true, subtree: true });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply, { once: true });
  else apply();
})();
