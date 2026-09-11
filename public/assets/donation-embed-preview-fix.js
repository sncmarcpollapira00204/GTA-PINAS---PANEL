(() => {
  'use strict';

  function normalize(value) {
    return String(value || '')
      .replace(/\*\*/g, '')
      .replace(/__/g, '')
      .replace(/~~/g, '')
      .replace(/^#{1,3}\s+/, '')
      .trim()
      .toLowerCase();
  }

  function stripDuplicateTitleFromTextarea() {
    const titleEl = document.getElementById('dee-title');
    const descriptionEl = document.getElementById('dee-description');
    if (!titleEl || !descriptionEl) return false;

    const title = normalize(titleEl.value);
    if (!title) return false;

    const lines = String(descriptionEl.value || '').split('\n');
    let first = 0;
    while (first < lines.length && !lines[first].trim()) first += 1;
    if (first >= lines.length) return false;

    const line = lines[first].trim();
    const match = line.match(/^>\s*(#{1,3}\s+)?(.*?)\s*$/);
    if (!match || normalize(match[2]) !== title) return false;

    lines.splice(first, 1);
    while (first < lines.length && !lines[first].trim()) lines.splice(first, 1);
    descriptionEl.value = lines.join('\n');
    return true;
  }

  function sanitizeOutgoingPayload(payload) {
    if (!payload?.embed || typeof payload.embed !== 'object') return payload;
    const next = { ...payload, embed: { ...payload.embed } };
    const title = normalize(next.embed.title);
    if (!title || !next.embed.description) return next;

    const lines = String(next.embed.description).split('\n');
    let first = 0;
    while (first < lines.length && !lines[first].trim()) first += 1;
    if (first >= lines.length) return next;

    const line = lines[first].trim();
    const match = line.match(/^>\s*(#{1,3}\s+)?(.*?)\s*$/);
    if (!match || normalize(match[2]) !== title) return next;

    lines.splice(first, 1);
    while (first < lines.length && !lines[first].trim()) lines.splice(first, 1);
    next.embed.description = lines.join('\n');
    return next;
  }

  function patchFetch() {
    if (window.__gtaDonationFetchPatchedV2) return;
    window.__gtaDonationFetchPatchedV2 = true;
    const originalFetch = window.fetch.bind(window);

    window.fetch = (input, init = {}) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      const method = String(init.method || (typeof input !== 'string' ? input?.method : '') || 'GET').toUpperCase();
      if (!/\/api\/donation\/(?:embed|message)(?:$|\?)/.test(String(url)) || !['POST', 'PATCH'].includes(method) || typeof init.body !== 'string') {
        return originalFetch(input, init);
      }

      try {
        const payload = sanitizeOutgoingPayload(JSON.parse(init.body));
        init = { ...init, body: JSON.stringify(payload) };
      } catch (_) {}

      return originalFetch(input, init);
    };
  }

  function compactQuoteBlocks(description) {
    const children = Array.from(description.childNodes);

    for (let i = 0; i < children.length; i += 1) {
      const current = children[i];
      if (!(current.nodeType === Node.ELEMENT_NODE && current.classList.contains('dh-quote'))) continue;

      let cursor = current.nextSibling;
      while (cursor) {
        const next = cursor.nextSibling;

        if (cursor.nodeType === Node.ELEMENT_NODE && cursor.tagName === 'BR') {
          cursor.remove();
          cursor = next;
          continue;
        }

        if (cursor.nodeType === Node.ELEMENT_NODE && cursor.classList.contains('dh-quote')) {
          const line = document.createElement('span');
          line.className = 'dh-quote-line';
          while (cursor.firstChild) line.appendChild(cursor.firstChild);
          current.appendChild(document.createElement('br'));
          current.appendChild(line);
          cursor.remove();
          cursor = next;
          continue;
        }

        break;
      }
    }
  }

  function installStyles() {
    if (document.getElementById('gta-preview-spacing-fix')) return;
    const style = document.createElement('style');
    style.id = 'gta-preview-spacing-fix';
    style.textContent = `
      .dh-description > .dh-quote {
        display:block !important;
        margin:0 !important;
        padding:1px 0 1px 10px !important;
        line-height:19px !important;
        min-height:19px !important;
      }
      .dh-description > .dh-quote + br,
      .dh-description > br:has(+ .dh-quote) {
        display:none !important;
      }
      .dh-description > .dh-quote .dh-quote-line {
        display:block !important;
        margin:0 !important;
        padding:0 !important;
        line-height:19px !important;
      }
      .dh-description > .dh-quote.dh-markdown-heading,
      .dh-description > .dh-quote.dh-markdown-heading-1,
      .dh-description > .dh-quote.dh-markdown-heading-2,
      .dh-description > .dh-quote.dh-markdown-heading-3 {
        margin:0 !important;
        padding-top:1px !important;
        padding-bottom:1px !important;
      }
    `;
    document.head.appendChild(style);
  }

  function cleanup() {
    installStyles();
    const changed = stripDuplicateTitleFromTextarea();
    if (changed) document.getElementById('dee-description')?.dispatchEvent(new Event('input', { bubbles: true }));

    document.querySelectorAll('#dee-preview .dh-description').forEach((description) => {
      compactQuoteBlocks(description);
    });
  }

  function boot() {
    installStyles();
    patchFetch();
    cleanup();
    const root = document.getElementById('view-donation-embed-editor');
    if (!root) return window.setTimeout(boot, 100);

    root.addEventListener('click', (event) => {
      if (event.target?.closest?.('#dee-load-button')) window.setTimeout(cleanup, 300);
    }, true);
    root.addEventListener('input', () => window.setTimeout(cleanup, 0), true);

    new MutationObserver(cleanup).observe(root, { childList:true, subtree:true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();
})();
