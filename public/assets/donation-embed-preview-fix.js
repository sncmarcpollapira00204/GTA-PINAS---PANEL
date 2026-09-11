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

  function normalizeQuoteSpacing(description) {
    const nodes = Array.from(description.childNodes);
    let changed = false;

    for (let i = 0; i < nodes.length;) {
      if (nodes[i].nodeType !== Node.ELEMENT_NODE || nodes[i].tagName !== 'BR') {
        i += 1;
        continue;
      }

      const start = i;
      while (i < nodes.length && nodes[i].nodeType === Node.ELEMENT_NODE && nodes[i].tagName === 'BR') i += 1;
      const end = i;
      const count = end - start;

      const previous = nodes[start - 1];
      const next = nodes[end];
      const previousIsQuote = previous?.nodeType === Node.ELEMENT_NODE && previous.classList.contains('dh-quote');
      const nextIsQuote = next?.nodeType === Node.ELEMENT_NODE && next.classList.contains('dh-quote');

      // Consecutive quoted lines are already block elements. One source newline
      // should not create another visual line; two source newlines should keep
      // exactly one blank line, matching Discord's normal spacing.
      if (previousIsQuote && nextIsQuote) {
        const keep = count >= 2 ? 1 : 0;
        for (let j = start; j < end - keep; j += 1) {
          nodes[j]?.remove();
          changed = true;
        }
      }
    }

    return changed;
  }

  function installStyles() {
    if (document.getElementById('gta-preview-spacing-fix')) return;
    const style = document.createElement('style');
    style.id = 'gta-preview-spacing-fix';
    style.textContent = `
      .dh-description > .dh-quote,
      .dh-description > .dh-quote.dh-markdown-heading { margin-top:0 !important; margin-bottom:0 !important; }
      .dh-description > .dh-quote + .dh-quote { margin-top:0 !important; }
    `;
    document.head.appendChild(style);
  }

  function cleanup() {
    installStyles();
    const changed = stripDuplicateTitleFromTextarea();
    if (changed) document.getElementById('dee-description')?.dispatchEvent(new Event('input', { bubbles: true }));

    document.querySelectorAll('#dee-preview .dh-description').forEach((description) => {
      normalizeQuoteSpacing(description);
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
