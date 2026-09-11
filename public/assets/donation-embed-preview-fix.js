(() => {
  'use strict';

  function applyDiscordHeadingFormatting() {
    const preview = document.getElementById('dee-preview');
    if (!preview) return;

    preview.querySelectorAll('.dh-quote').forEach((quote) => {
      if (quote.dataset.headingFixed === '1') return;

      const text = (quote.textContent || '').trim();
      const match = text.match(/^(#{1,3})\s+(.+)$/s);
      if (!match) return;

      const level = match[1].length;
      quote.dataset.headingFixed = '1';
      quote.classList.add('dh-markdown-heading', `dh-markdown-heading-${level}`);
      quote.textContent = match[2].trim();
    });

    preview.querySelectorAll('.dh-description, .dh-field-value').forEach((container) => {
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
      const nodes = [];
      let node;
      while ((node = walker.nextNode())) nodes.push(node);

      nodes.forEach((textNode) => {
        const text = (textNode.nodeValue || '').trim();
        const match = text.match(/^(#{1,3})\s+(.+)$/s);
        if (!match || textNode.parentElement?.dataset?.headingFixed === '1') return;

        const span = document.createElement('span');
        span.dataset.headingFixed = '1';
        span.className = `dh-markdown-heading dh-markdown-heading-${match[1].length}`;
        span.textContent = match[2].trim();
        textNode.parentNode?.replaceChild(span, textNode);
      });
    });
  }

  function install() {
    const preview = document.getElementById('dee-preview');
    const root = document.getElementById('view-donation-embed-editor');
    if (!preview || !root) {
      window.setTimeout(install, 100);
      return;
    }

    applyDiscordHeadingFormatting();
    new MutationObserver(() => {
      window.requestAnimationFrame(applyDiscordHeadingFormatting);
    }).observe(preview, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    root.addEventListener('input', () => {
      window.requestAnimationFrame(applyDiscordHeadingFormatting);
    }, true);
  }

  const style = document.createElement('style');
  style.textContent = `
    .dh-markdown-heading-1 { display:block; font-size:18px!important; line-height:24px!important; font-weight:700!important; }
    .dh-markdown-heading-2 { display:block; font-size:16px!important; line-height:22px!important; font-weight:700!important; }
    .dh-markdown-heading-3 { display:block; font-size:14px!important; line-height:20px!important; font-weight:700!important; }
    .dh-quote.dh-markdown-heading { margin-top:8px!important; margin-bottom:8px!important; padding-top:3px!important; padding-bottom:3px!important; }
  `;
  document.head.appendChild(style);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
