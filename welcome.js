// Preserve old root hash links without sending new visitors past the introduction.
(() => {
  const legacyViews = ['today','ask','health','profile','symptoms','medications','appointments','results','timeline','documents','summary'];
  if (legacyViews.includes(location.hash.slice(1))) location.replace('/health-hub' + location.hash);
  const icons = [
    '<path d="M3 12h4l2-5 4 10 2-5h6"/>',
    '<rect x="3.5" y="8" width="17" height="8" rx="4" transform="rotate(-45 12 12)"/><path d="m9.2 14.8 5.6-5.6"/>',
    '<path d="M6 3.5h8l4 4v13H6zM14 3.5v4h4M9 12h6M9 15.5h4"/>',
    '<rect x="3.5" y="5.5" width="17" height="15" rx="3"/><path d="M8 3.5v4M16 3.5v4M3.5 10h17M8 15l2 2 4-4"/>'
  ];
  document.querySelectorAll('.landing-tiles a>span').forEach((icon,i)=>{icon.innerHTML=`<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[i]}</svg>`;});
})();
