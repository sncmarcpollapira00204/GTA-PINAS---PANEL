(() => {
  'use strict';

  const STYLE_ID = 'gta-discord-preview-final-spacing';

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .dh-description .dh-preview-quote-group {
        display:block !important;
        border-left:4px solid #4e5058 !important;
        margin:0 !important;
        padding:0 0 0 8px !important;
        line-height:19px !important;
        box-sizing:border-box;
      }
      .dh-description .dh-preview-quote-group .dh-quote {
        display:block !important;
        border:0 !important;
        margin:0 !important;
        padding:0 !important;
        min-height:19px !important;
        line-height:19px !important;
      }
      .dh-description .dh-preview-quote-group .dh-quote + br {
        display:none !important;
      }
      .dh-description .dh-preview-heading {
        display:block !important;
        font-weight:700 !important;
        font-size:16px !important;
        line-height:21px !important;
        margin:0 !important;
        padding:0 !important;
      }
      .dh-description > br.dh-preview-section-gap {
        display:block !important;
        height:19px !important;
        line-height:19px !important;
        content:"";
      }
    `;
    document.head.appendChild(style);
  }

  function prepareQuote(quote) {
    if (quote.dataset.previewPrepared === '1') return;
    quote.dataset.previewPrepared = '1';

    const raw = String(quote.textContent || '').trim();
    const match = raw.match(/^#{1,3}\s+(.+)$/s);
    if (match) {
      quote.classList.add('dh-preview-heading');
      quote.textContent = match[1].trim();
    }
  }

  function rebuild(container) {
    const children = Array.from(container.childNodes);
    if (!children.some((node) => node.nodeType === Node.ELEMENT_NODE && node.classList.contains('dh-quote'))) return;

    const fragment = document.createDocumentFragment();
    let i = 0;

    while (i < children.length) {
      const node = children[i];
      const isQuote = node.nodeType === Node.ELEMENT_NODE && node.classList.contains('dh-quote');
      if (!isQuote) {
        fragment.appendChild(node);
        i += 1;
        continue;
      }

      const group = document.createElement('div');
      group.className = 'dh-preview-quote-group';
      let breakCountAfterLastQuote = 0;

      while (i < children.length) {
        const quote = children[i];
        const quoteIsQuote = quote.nodeType === Node.ELEMENT_NODE && quote.classList.contains('dh-quote');
        if (!quoteIsQuote) break;

        prepareQuote(quote);
        group.appendChild(quote);
        i += 1;

        breakCountAfterLastQuote = 0;
        while (i < children.length && children[i].nodeType === Node.ELEMENT_NODE && children[i].tagName === 'BR') {
          breakCountAfterLastQuote += 1;
          i += 1;
        }

        const next = children[i];
        const nextIsQuote = next?.nodeType === Node.ELEMENT_NODE && next.classList.contains('dh-quote');

        // One newline keeps the quote block continuous. Two or more newlines
        // separate Discord quote paragraphs with one visual blank line.
        if (nextIsQuote && breakCountAfterLastQuote <= 1) continue;
        break;
      }

      fragment.appendChild(group);

      const next = children[i];
      const nextIsQuote = next?.nodeType === Node.ELEMENT_NODE && next.classList.contains('dh-quote');
      if (nextIsQuote && breakCountAfterLastQuote >= 2) {
        const gap = document.createElement('br');
        gap.className = 'dh-preview-section-gap';
        fragment.appendChild(gap);
      }
    }

    container.replaceChildren(fragment);
  }

  function cleanup() {
    installStyles();
    document.querySelectorAll('#dee-preview .dh-description').forEach(rebuild);
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
      if (event.target?.closest?.('#dee-load-button,#dee-reset,#dee-preview-button')) window.setTimeout(schedule, 120);
    }, true);

    new MutationObserver(schedule).observe(root, { childList:true, subtree:true });
    schedule();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();
})();
