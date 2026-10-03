document.addEventListener('DOMContentLoaded', () => {
  const button = document.querySelector('[data-share-resource]');
  const status = document.querySelector('[data-share-status]');
  const fallbackLink = document.querySelector('[data-share-link]');
  const canonicalLink = document.querySelector('link[rel="canonical"]');
  if (!button || !status || !fallbackLink || !canonicalLink) return;

  let publicURL;
  try {
    publicURL = new URL(canonicalLink.href);
    if (publicURL.origin !== 'https://www.doctoraiworld.com' ||
        publicURL.pathname !== location.pathname || publicURL.search || publicURL.hash) return;
  } catch {
    return;
  }

  const shareData = {
    title: button.dataset.shareTitle || document.title,
    text: button.dataset.shareText || '',
    url: publicURL.href
  };

  async function copyPublicLink() {
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(publicURL.href);
        status.textContent = 'Public page link copied. Only the public page link is included.';
        return;
      } catch {
        // Show a selectable public URL if the browser blocks clipboard access.
      }
    }

    fallbackLink.hidden = false;
    fallbackLink.value = publicURL.href;
    fallbackLink.focus();
    fallbackLink.select();
    status.textContent = 'Copy this public page link to share it. Nothing you typed is included.';
  }

  button.addEventListener('click', async () => {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share(shareData);
        status.textContent = 'The share menu was offered this public page link and a fixed description only.';
        return;
      } catch (error) {
        if (error?.name === 'AbortError') {
          status.textContent = 'Sharing was cancelled. Nothing was shared.';
          return;
        }
      }
    }

    await copyPublicLink();
  });
});
