(function () {
  'use strict';
  // Canonical Home artwork for public-page feature illustrations.
  const artwork = {
  "cyan": "<svg aria-hidden=\"true\" viewBox=\"0 0 24 24\"><path class=\"icon-fill\" d=\"M12 2.9c.7 4.5 2.6 6.4 7.1 7.1-4.5.7-6.4 2.6-7.1 7.1-.7-4.5-2.6-6.4-7.1-7.1 4.5-.7 6.4-2.6 7.1-7.1Z\"/><path d=\"M12 2.9c.7 4.5 2.6 6.4 7.1 7.1-4.5.7-6.4 2.6-7.1 7.1-.7-4.5-2.6-6.4-7.1-7.1 4.5-.7 6.4-2.6 7.1-7.1Z\"/><path d=\"M18.8 3.5v3M20.3 5h-3M4.5 16.6V19M5.7 17.8H3.3\"/></svg>",
  "blue": "<svg aria-hidden=\"true\" viewBox=\"0 0 24 24\"><rect class=\"icon-fill\" x=\"3.5\" y=\"8\" width=\"17\" height=\"8\" rx=\"4\" transform=\"rotate(-45 12 12)\"/><rect x=\"3.5\" y=\"8\" width=\"17\" height=\"8\" rx=\"4\" transform=\"rotate(-45 12 12)\"/><path d=\"m9.2 14.8 5.6-5.6M17.4 4.2v3M18.9 5.7h-3.1\"/></svg>",
  "violet": "<svg aria-hidden=\"true\" viewBox=\"0 0 24 24\"><rect class=\"icon-fill\" x=\"3.5\" y=\"5.5\" width=\"17\" height=\"15\" rx=\"3\"/><rect x=\"3.5\" y=\"5.5\" width=\"17\" height=\"15\" rx=\"3\"/><path d=\"M8 3.5v4M16 3.5v4M3.5 10h17M8 15l2 2 4-4\"/><circle class=\"icon-solid\" cx=\"17.5\" cy=\"15.5\" r=\"1\"/></svg>",
  "mint": "<svg aria-hidden=\"true\" viewBox=\"0 0 24 24\"><path class=\"icon-fill\" d=\"M6 3.5h8l4 4v13H6z\"/><path d=\"M6 3.5h8l4 4v13H6zM14 3.5v4h4M9 12h6M9 15.5h4\"/><circle class=\"icon-solid\" cx=\"9.5\" cy=\"18\" r=\"1\"/></svg>",
  "coral": "<svg aria-hidden=\"true\" viewBox=\"0 0 24 24\"><path class=\"icon-fill\" d=\"M4 12h3l2-5 4 10 2.2-5H20v7H4z\"/><path d=\"M3 12h4l2-5 4 10 2.2-5H21M5 4.5h14a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2Z\"/></svg>",
  "yellow": "<svg aria-hidden=\"true\" viewBox=\"0 0 24 24\"><circle class=\"icon-fill\" cx=\"10.5\" cy=\"10.5\" r=\"6.5\"/><circle cx=\"10.5\" cy=\"10.5\" r=\"6.5\"/><path d=\"m15.4 15.4 5.1 5.1M8.2 10.5h4.6M10.5 8.2v4.6M18 3.4v3.2M19.6 5h-3.2\"/></svg>"
};
  const apply = () => {
    const replace = (selector, tone) => document.querySelectorAll(selector).forEach(icon => {
      icon.innerHTML = artwork[tone];
      icon.classList.add('feature-icon', 'tone-' + tone);
      icon.setAttribute('aria-hidden', 'true');
    });
    replace('.preview-appointment > .preview-icon', 'violet');
    replace('.preview-grid > div:nth-child(1) > .preview-icon', 'mint');
    replace('.preview-grid > div:nth-child(2) > .preview-icon', 'cyan');
    replace('.preview-grid > div:nth-child(3) > .preview-icon', 'blue');
    replace('.preview-grid > div:nth-child(4) > .preview-icon', 'yellow');
    replace('[data-research-tab="highlights"] > span', 'cyan');
    replace('[data-research-tab="explore"] > span', 'yellow');
    replace('.feature-card > .feature-icon.blue', 'cyan');
    replace('.feature-card > .feature-icon.purple', 'violet');
    replace('.feature-card > .feature-icon.orange', 'blue');
    replace('.feature-card > .feature-icon.green', 'mint');
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply, { once: true });
  else apply();
})();
