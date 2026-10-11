// Preserve old root hash links without sending new visitors past the introduction.
(() => {
  const legacyViews = ['today','ask','health','profile','symptoms','medications','appointments','results','timeline','documents','summary'];
  if (legacyViews.includes(location.hash.slice(1))) location.replace('/health-hub' + location.hash);
})();
