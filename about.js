(function () {
  'use strict';

  const photo = document.querySelector('.family-photo');
  const fallback = document.querySelector('.photo-fallback');
  if (!photo || !fallback) return;

  const showFallback = () => {
    photo.hidden = true;
    fallback.hidden = false;
  };

  photo.addEventListener('error', showFallback, { once: true });
  if (photo.complete && photo.naturalWidth === 0) showFallback();
})();
