(() => {
  const apply = () => {
    document.querySelectorAll('.brand-mark.brand-logo img').forEach((img) => {
      img.src = '/assets/logo.png?v=20260911-logo';
      img.hidden = false;
      img.style.setProperty('display', 'block', 'important');
      img.style.setProperty('width', '100%', 'important');
      img.style.setProperty('height', '100%', 'important');
      img.style.setProperty('object-fit', 'contain', 'important');
      img.style.setProperty('object-position', 'center', 'important');
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply, { once: true }); else apply();
  new MutationObserver(apply).observe(document.documentElement, { childList: true, subtree: true });
})();