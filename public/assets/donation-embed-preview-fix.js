(() => {
  'use strict';

  const esc = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  const safeUrl = (value) => {
    try {
      const url = new URL(String(value || '').trim());
      return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
    } catch (_) {
      return '';
    }
  };

  const normalizeColor = (value) => {
    const raw = String(value || '').trim().replace(/^#/, '');
    return /^[0-9a-f]{6}$/i.test(raw) ? `#${raw.toUpperCase()}` : '#5865F2';
  };

  function inlineMarkdown(value) {
    let text = esc(value);
    const protectedParts = [];
    const protect = (html) => {
      const token = `\u0001${protectedParts.length}\u0002`;
      protectedParts.push(html);
      return token;
    };

    text = text.replace(/```([\s\S]*?)```/g, (_, code) => protect(`<pre class="accurate-codeblock"><code>${code.trim()}</code></pre>`));
    text = text.replace(/`([^`\n]+)`/g, (_, code) => protect(`<code class="accurate-code">${code}</code>`));
    text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, url) => protect(`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`));
    text = text.replace(/\|\|([\s\S]*?)\|\|/g, (_, content) => protect(`<span class="accurate-spoiler">${content}</span>`));
    text = text.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/__([^_\n]+)__/g, '<u>$1</u>');
    text = text.replace(/~~([^~\n]+)~~/g, '<s>$1</s>');
    text = text.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
    text = text.replace(/\u0001(\d+)\u0002/g, (_, index) => protectedParts[Number(index)] || '');
    return text;
  }

  function renderDiscordText(value) {
    const lines = String(value || '').split('\n');
    const html = [];
    let quoteLines = [];

    const flushQuote = () => {
      if (!quoteLines.length) return;
      html.push(`<div class="accurate-quote">${quoteLines.map((line) => inlineMarkdown(line)).join('<br>')}</div>`);
      quoteLines = [];
    };

    for (const rawLine of lines) {
      const line = rawLine.replace(/^\u200b/, '');
      const quoteMatch = line.match(/^> ?(.*)$/);
      if (quoteMatch) {
        quoteLines.push(quoteMatch[1]);
        continue;
      }
      flushQuote();
      html.push(line ? inlineMarkdown(line) : '<br>');
    }
    flushQuote();
    return html.join('<br>');
  }

  function getData() {
    const value = (id) => document.getElementById(id)?.value || '';
    return {
      title: value('dee-title').trim(),
      description: value('dee-description'),
      color: normalizeColor(value('dee-color')),
      image: safeUrl(value('dee-image')),
      thumbnail: safeUrl(value('dee-thumbnail')),
      author: value('dee-author').trim(),
      footer: value('dee-footer').trim(),
    };
  }

  function installStyles() {
    if (document.getElementById('accurate-donation-preview-styles')) return;
    const style = document.createElement('style');
    style.id = 'accurate-donation-preview-styles';
    style.textContent = `
      .accurate-donation-preview{font-family:Arial,Helvetica,sans-serif;color:#dbdee1}
      .accurate-message{display:grid;grid-template-columns:40px minmax(0,1fr);gap:12px;align-items:start}
      .accurate-avatar{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;background:#5865f2;color:#fff;font-size:12px;font-weight:800}
      .accurate-main{min-width:0}
      .accurate-meta{height:24px;display:flex;align-items:center;gap:6px;white-space:nowrap}
      .accurate-username{font-size:16px;line-height:20px;font-weight:600;color:#f2f3f5}
      .accurate-bot{font-size:10px;line-height:16px;padding:0 4px;border-radius:3px;background:#5865f2;color:#fff;font-weight:700}
      .accurate-time{font-size:12px;color:#949ba4}
      .accurate-embed{position:relative;width:min(516px,100%);background:#2b2d31;border-left:4px solid var(--accurate-accent);border-radius:4px;padding:8px 16px 10px 12px;box-sizing:border-box;overflow:hidden}
      .accurate-author{display:flex;align-items:center;gap:6px;color:#b5bac1;font-size:12px;font-weight:600;line-height:16px;margin-bottom:4px}
      .accurate-title{font-size:16px;line-height:21px;font-weight:600;color:#f2f3f5;word-break:break-word;margin-bottom:4px}
      .accurate-description{font-size:14px;line-height:19px;color:#dbdee1;word-break:break-word}
      .accurate-description strong{font-weight:700}.accurate-description em{font-style:italic}.accurate-description u{text-decoration:underline}.accurate-description s{text-decoration:line-through}
      .accurate-description a{color:#00a8fc;text-decoration:none}
      .accurate-quote{border-left:4px solid #4e5058;padding-left:8px;color:#dbdee1;min-height:19px}
      .accurate-code{background:#1e1f22;border:1px solid #3f4147;border-radius:3px;padding:1px 4px;font-family:Consolas,monospace;font-size:12px}
      .accurate-codeblock{display:block;background:#1e1f22;border-radius:4px;padding:8px;white-space:pre-wrap;font-family:Consolas,monospace;font-size:12px;line-height:17px;margin:5px 0;overflow:auto}
      .accurate-spoiler{background:#202225;color:transparent;border-radius:3px;padding:0 2px}.accurate-spoiler:hover{color:#dbdee1}
      .accurate-thumb{float:right;width:80px;height:80px;object-fit:cover;border-radius:4px;margin:0 0 8px 16px}
      .accurate-image{display:block;width:auto;max-width:100%;max-height:400px;object-fit:contain;border-radius:4px;margin-top:16px}
      .accurate-footer{display:flex;align-items:center;gap:5px;color:#949ba4;font-size:11px;line-height:14px;margin-top:8px;clear:both}
    `;
    document.head.appendChild(style);
  }

  function render() {
    const box = document.getElementById('dee-preview');
    if (!box) return;
    const data = getData();
    const description = renderDiscordText(data.description);
    const authorHtml = data.author ? `<div class="accurate-author"><span>${esc(data.author)}</span></div>` : '';
    const thumbHtml = data.thumbnail ? `<img class="accurate-thumb" src="${esc(data.thumbnail)}" alt="">` : '';
    const imageHtml = data.image ? `<img class="accurate-image" src="${esc(data.image)}" alt="">` : '';
    const footerHtml = data.footer ? `<div class="accurate-footer"><span>${esc(data.footer)}</span></div>` : '';

    box.innerHTML = `
      <div class="accurate-donation-preview" data-accurate-renderer="1">
        <div class="accurate-message">
          <div class="accurate-avatar">GP</div>
          <div class="accurate-main">
            <div class="accurate-meta">
              <span class="accurate-username">GTA Pinas Treasury</span>
              <span class="accurate-bot">BOT</span>
              <span class="accurate-time">Today at ${esc(new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }))}</span>
            </div>
            <div class="accurate-embed" style="--accurate-accent:${esc(data.color)}">
              ${authorHtml}
              ${data.title ? `<div class="accurate-title">${esc(data.title)}</div>` : ''}
              ${thumbHtml}
              ${description ? `<div class="accurate-description">${description}</div>` : '<div class="accurate-description" style="color:#949ba4">Start typing to preview the embed.</div>'}
              ${imageHtml}
              ${footerHtml}
            </div>
          </div>
        </div>
      </div>`;
  }

  function bind() {
    installStyles();
    const root = document.getElementById('view-donation-embed-editor');
    if (!root || root.dataset.accuratePreviewBound === '1') return Boolean(root);
    root.dataset.accuratePreviewBound = '1';

    const deferRender = (delay = 0) => window.setTimeout(render, delay);

    root.addEventListener('input', (event) => {
      if (event.target?.matches?.('#dee-title,#dee-description,#dee-color,#dee-image,#dee-thumbnail,#dee-author,#dee-footer')) {
        deferRender(0);
      }
    }, true);

    root.addEventListener('click', (event) => {
      if (event.target?.closest?.('#dee-load-button,#dee-reset,#dee-preview-button')) {
        deferRender(100);
      }
    }, true);

    new MutationObserver(() => {
      const box = document.getElementById('dee-preview');
      if (box && !box.querySelector('[data-accurate-renderer="1"]')) deferRender(0);
    }).observe(root, { childList: true, subtree: true });

    deferRender(0);
    return true;
  }

  function boot() {
    if (!bind()) window.setTimeout(boot, 100);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
