(() => {
  'use strict';

  const STYLE_ID = 'gta-discord-preview-markdown-fix';

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .dh-description .dh-preview-heading {
        display:block !important;
        font-weight:700 !important;
        color:#f2f3f5 !important;
        word-break:break-word;
        margin:2px 0 4px !important;
      }
      .dh-description .dh-preview-heading-1 { font-size:20px !important; line-height:24px !important; }
      .dh-description .dh-preview-heading-2 { font-size:18px !important; line-height:22px !important; }
      .dh-description .dh-preview-heading-3 { font-size:16px !important; line-height:20px !important; }
    `;
    document.head.appendChild(style);
  }

  function convertHeadingElement(el) {
    const raw = String(el.textContent || '').trim();
    const match = raw.match(/^(#{1,3})\s+(.+?)\s*$/);
    if (!match) return;
    const level = match[1].length;
    el.classList.add('dh-preview-heading', `dh-preview-heading-${level}`);
    el.textContent = match[2];
  }

  function convertRawHeadingText(container) {
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let current;
    while ((current = walker.nextNode())) nodes.push(current);

    nodes.forEach((node) => {
      const value = String(node.nodeValue || '');
      if (!/^\s*#{1,3}\s+/.test(value)) return;
      const parent = node.parentElement;
      if (!parent || parent.closest('code,pre')) return;

      const match = value.match(/^(\s*)(#{1,3})\s+(.+?)\s*$/s);
      if (!match) return;
      const heading = document.createElement('span');
      heading.className = `dh-preview-heading dh-preview-heading-${match[2].length}`;
      heading.textContent = match[3];

      if (value.startsWith(match[1]) && parent.childNodes.length === 1) {
        parent.replaceWith(heading);
      }
    });
  }

  function cleanup() {
    installStyles();
    document.querySelectorAll('#dee-preview .dh-description').forEach((container) => {
      container.querySelectorAll('.dh-quote').forEach((quote) => {
        const text = String(quote.textContent || '').trim();
        if (/^#{1,3}\s+/.test(text)) convertHeadingElement(quote);
      });
      convertRawHeadingText(container);
    });
  }

  function boot() {
    installStyles();
    const root = document.getElementById('view-donation-embed-editor');
    if (!root) return window.setTimeout(boot, 100);

    let queued = false;
    const schedule = () => {
      if (queued) return;
      queued = true;
      window.requestAnimationFrame(() => {
        queued = false;
        cleanup();
      });
    };

    root.addEventListener('input', schedule, true);
    root.addEventListener('click', (event) => {
      if (event.target?.closest?.('#dee-load-button,#dee-reset,#dee-preview-button')) {
        window.setTimeout(schedule, 120);
      }
    }, true);

    new MutationObserver(schedule).observe(root, { childList:true, subtree:true, characterData:true });
    schedule();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();
})();