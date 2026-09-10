(() => {
  'use strict';

  // Compatibility shim: the Discohook-style renderer is authoritative.
  // Keep this legacy asset loaded without creating a competing preview renderer.
  const boot = () => {
    if (typeof window.__gtaRenderDonationEmbedPreview === 'function') {
      window.__gtaRenderDonationEmbedPreview();
      return;
    }
    window.setTimeout(boot, 150);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
