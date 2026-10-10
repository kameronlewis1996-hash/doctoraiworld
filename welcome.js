// Preserve old root hash links without sending new visitors past the introduction.
(() => {
  const legacyViews = ['today','ask','health','profile','symptoms','medications','appointments','results','timeline','documents','summary'];
  if (legacyViews.includes(location.hash.slice(1))) location.replace('/health-hub' + location.hash);
  const icons = [
    '<path d="M5 4.5h14a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-7l-5 4v-4H5a2 2 0 0 1-2-2v-7.5a2 2 0 0 1 2-2Z" fill="currentColor" fill-opacity=".14" stroke="none"/><path d="M5 4.5h14a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-7l-5 4v-4H5a2 2 0 0 1-2-2v-7.5a2 2 0 0 1 2-2Z"/><circle cx="8" cy="10.5" r=".8" fill="currentColor" stroke="none"/><circle cx="12" cy="10.5" r=".8" fill="currentColor" stroke="none"/><circle cx="16" cy="10.5" r=".8" fill="currentColor" stroke="none"/>',
    '<rect x="2.5" y="7.5" width="19" height="9" rx="4.5" fill="currentColor" fill-opacity=".14" stroke="none"/><rect x="2.5" y="7.5" width="19" height="9" rx="4.5"/><path d="M12 7.7v8.6M6 10.5h2M16 13.5h2"/>',
    '<path d="M3.5 7a2 2 0 0 1 2-2h5l2 2H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z" fill="currentColor" fill-opacity=".14" stroke="none"/><path d="M3.5 7a2 2 0 0 1 2-2h5l2 2H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z"/><path d="M8.5 10.5h5l2 2v5h-7zM13.5 10.5v2h2M10.5 14.5h3"/>',
    '<rect x="2.5" y="3.5" width="19" height="17" rx="3" fill="currentColor" fill-opacity=".14" stroke="none"/><rect x="2.5" y="3.5" width="19" height="17" rx="3"/><path d="M7 2.5v4M17 2.5v4M2.5 8.5h19"/><circle cx="7" cy="12" r=".8" fill="currentColor" stroke="none"/><circle cx="11" cy="12" r=".8" fill="currentColor" stroke="none"/><circle cx="7" cy="15.5" r=".8" fill="currentColor" stroke="none"/><circle cx="11" cy="15.5" r=".8" fill="currentColor" stroke="none"/><circle cx="16.8" cy="15.3" r="4.2" fill="white" stroke="currentColor"/><path d="M16.8 12.9v2.5l1.6 1"/>'
  ];
  document.querySelectorAll('.landing-tiles a>span').forEach((icon,i)=>{icon.innerHTML=`<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[i]}</svg>`;});
})();
