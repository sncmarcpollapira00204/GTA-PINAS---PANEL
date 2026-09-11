(() => {
  'use strict';

  function installStyles() {
    if (document.getElementById('gta-preview-spacing-fix')) return;
    const style = document.createElement('style');
    style.id = 'gta-preview-spacing-fix';
    style.textContent = `
      .dh-description > .dh-quote + br,
      .dh-description > br:has(+ .dh-quote) { display:none !important; }
      .dh-description > .dh-quote { margin-top:0 !important; margin-bottom:0 !important; }
      .dh-description > .dh-quote + .dh-quote { margin-top:0 !important; }
    `;
    document.head.appendChild(style);
  }

  function cleanup() {
    installStyles();
    document.querySelectorAll('#dee-preview .dh-description').forEach((description) => {
      Array.from(description.childNodes).forEach((node) => {
        if (node.nodeType !== Node.ELEMENT_NODE || node.tagName !== 'BR') return;
        const previous = node.previousElementSibling;
        const next = node.nextElementSibling;
        if (previous?.classList.contains('dh-quote') || next?.classList.contains('dh-quote')) node.remove();
      });
    });
  }

  function boot() {
    installStyles();
    cleanup();
    const root = document.getElementById('view-donation-embed-editor');
    if (!root) return window.setTimeout(boot, 100);
    new MutationObserver(cleanup).observe(root, { childList:true, subtree:true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();
})();
