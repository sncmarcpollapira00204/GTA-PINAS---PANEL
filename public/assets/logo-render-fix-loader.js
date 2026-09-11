// Forces the canonical logo asset on every dashboard render.
(() => {
  const applyCanonicalLogo = () => {
    document.querySelectorAll('.brand-mark.brand-logo img').forEach((img) => {
      if (img.getAttribute('src') !== '/assets/logo.png?v=20260911-logo') {
        img.setAttribute('src', '/assets/logo.png?v=20260911-logo');
      }
      img.removeAttribute('hidden');
      img.style.setProperty('display', 'block', 'important');
      img.style.setProperty('object-fit', 'contain', 'important');
      img.style.setProperty('object-position', 'center', 'important');
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyCanonicalLogo, { once: true });
  } else {
    applyCanonicalLogo();
  }

  new MutationObserver(applyCanonicalLogo).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
})();