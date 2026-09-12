(() => {
  'use strict';

  const STYLE_ID = 'gta-donation-preview-authoritative-styles';
  const AUTHORITATIVE_ATTR = 'data-dh-authoritative';
  const ROOT_ID = 'view-donation-embed-editor';
  const PREVIEW_ID = 'dee-preview';

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
    const raw = String(value ?? '').trim();
    if (/^#[0-9a-f]{6}$/i.test(raw)) return raw;

    if (/^\d+$/.test(raw)) {
      const number = Number(raw);
      if (Number.isSafeInteger(number) && number >= 0 && number <= 0xFFFFFF) {
        return `#${number.toString(16).padStart(6, '0')}`;
      }
    }

    return '#5865F2';
  };

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${PREVIEW_ID} .gta-authoritative-discord-preview {
        width: 100%;
        min-height: 100%;
        color: #dbdee1;
        font-family: Arial, Helvetica, sans-serif;
      }

      #${PREVIEW_ID} .gta-preview-message {
        display: grid;
        grid-template-columns: 40px minmax(0, 1fr);
        gap: 12px;
        align-items: start;
      }

      #${PREVIEW_ID} .gta-preview-avatar {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        display: grid;
        place-items: center;
        background: #5865f2;
        color: #fff;
        font-size: 12px;
        font-weight: 800;
      }

      #${PREVIEW_ID} .gta-preview-main {
        min-width: 0;
      }

      #${PREVIEW_ID} .gta-preview-meta {
        min-height: 24px;
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
      }

      #${PREVIEW_ID} .gta-preview-username {
        color: #f2f3f5;
        font-size: 16px;
        line-height: 20px;
        font-weight: 600;
      }

      #${PREVIEW_ID} .gta-preview-bot {
        color: #fff;
        background: #5865f2;
        border-radius: 3px;
        padding: 0 4px;
        font-size: 10px;
        line-height: 16px;
        font-weight: 700;
      }

      #${PREVIEW_ID} .gta-preview-time {
        color: #949ba4;
        font-size: 12px;
        line-height: 16px;
      }

      #${PREVIEW_ID} .gta-preview-embed {
        position: relative;
        width: min(516px, 100%);
        box-sizing: border-box;
        padding: 10px 16px 12px 12px;
        border-left: 4px solid var(--gta-preview-accent, #5865F2);
        border-radius: 4px;
        background: #2b2d31;
        overflow: hidden;
      }

      #${PREVIEW_ID} .gta-preview-author {
        display: flex;
        align-items: center;
        gap: 6px;
        margin: 0 0 5px;
        color: #b5bac1;
        font-size: 12px;
        line-height: 16px;
        font-weight: 600;
        word-break: break-word;
      }

      #${PREVIEW_ID} .gta-preview-author img {
        width: 20px;
        height: 20px;
        border-radius: 50%;
        object-fit: cover;
        flex: 0 0 auto;
      }

      #${PREVIEW_ID} .gta-preview-title {
        margin: 0 0 5px;
        color: #f2f3f5;
        font-size: 16px;
        line-height: 21px;
        font-weight: 600;
        word-break: break-word;
      }

      #${PREVIEW_ID} .gta-preview-description {
        color: #dbdee1;
        font-size: 14px;
        line-height: 19px;
        word-break: break-word;
      }

      #${PREVIEW_ID} .gta-preview-description h1,
      #${PREVIEW_ID} .gta-preview-description h2,
      #${PREVIEW_ID} .gta-preview-description h3 {
        color: #f2f3f5;
        font-weight: 700;
        word-break: break-word;
      }

      #${PREVIEW_ID} .gta-preview-description h1 {
        margin: 2px 0 5px;
        font-size: 20px;
        line-height: 24px;
      }

      #${PREVIEW_ID} .gta-preview-description h2 {
        margin: 2px 0 5px;
        font-size: 18px;
        line-height: 22px;
      }

      #${PREVIEW_ID} .gta-preview-description h3 {
        margin: 2px 0 5px;
        font-size: 16px;
        line-height: 20px;
      }

      #${PREVIEW_ID} .gta-preview-description strong {
        font-weight: 700;
      }

      #${PREVIEW_ID} .gta-preview-description em {
        font-style: italic;
      }

      #${PREVIEW_ID} .gta-preview-description u {
        text-decoration: underline;
      }

      #${PREVIEW_ID} .gta-preview-description s {
        text-decoration: line-through;
      }

      #${PREVIEW_ID} .gta-preview-code {
        display: inline-block;
        padding: 1px 4px;
        border-radius: 3px;
        background: #1e1f22;
        border: 1px solid #3f4147;
        font-family: Consolas, Monaco, monospace;
        font-size: 12px;
      }

      #${PREVIEW_ID} .gta-preview-spoiler {
        border-radius: 3px;
        padding: 0 2px;
        background: #202225;
        color: transparent;
        cursor: pointer;
      }

      #${PREVIEW_ID} .gta-preview-spoiler:hover {
        color: #dbdee1;
      }

      #${PREVIEW_ID} .gta-preview-link {
        color: #00a8fc;
        text-decoration: none;
      }

      #${PREVIEW_ID} .gta-preview-quote {
        margin: 2px 0;
        padding: 1px 0 1px 10px;
        border-left: 4px solid #4f545c;
        min-height: 19px;
        box-sizing: border-box;
      }

      #${PREVIEW_ID} .gta-preview-thumb {
        float: right;
        width: 80px;
        height: 80px;
        margin: 0 0 8px 16px;
        border-radius: 4px;
        object-fit: cover;
      }

      #${PREVIEW_ID} .gta-preview-image {
        display: block;
        max-width: 100%;
        max-height: 400px;
        width: auto;
        height: auto;
        margin-top: 12px;
        border-radius: 4px;
        object-fit: contain;
      }

      #${PREVIEW_ID} .gta-preview-footer {
        display: flex;
        align-items: center;
        gap: 5px;
        clear: both;
        margin-top: 9px;
        color: #949ba4;
        font-size: 11px;
        line-height: 14px;
        word-break: break-word;
      }

      #${PREVIEW_ID} .gta-preview-footer img {
        width: 20px;
        height: 20px;
        border-radius: 50%;
        object-fit: cover;
        flex: 0 0 auto;
      }

      #${PREVIEW_ID} .gta-preview-placeholder {
        color: #949ba4;
        font-size: 13px;
        line-height: 19px;
      }
    `;

    document.head.appendChild(style);
  }

  function getInput(id) {
    return document.getElementById(id);
  }

  function getValue(id, fallback = '') {
    const input = getInput(id);
    if (!input) return fallback;
    const value = String(input.value ?? '').trim();
    return value || fallback;
  }

  function inlineMarkdown(value) {
    let text = esc(value);
    const protectedParts = [];

    const protect = (html) => {
      const token = `\u0001${protectedParts.length}\u0002`;
      protectedParts.push(html);
      return token;
    };

    text = text.replace(/```([\s\S]*?)```/g, (_, code) => (
      protect(`<pre style="margin:5px 0;padding:8px;border-radius:4px;background:#1e1f22;white-space:pre-wrap;font-family:Consolas,Monaco,monospace;font-size:12px;line-height:17px;overflow:auto"><code>${code.trim()}</code></pre>`)
    ));

    text = text.replace(/`([^`\n]+)`/g, (_, code) => (
      protect(`<code class="gta-preview-code">${code}</code>`)
    ));

    text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, url) => (
      protect(`<a class="gta-preview-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`)
    ));

    text = text.replace(/\|\|([\s\S]*?)\|\|/g, (_, content) => (
      protect(`<span class="gta-preview-spoiler">${content}</span>`)
    ));

    text = text.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/__([^_\n]+)__/g, '<u>$1</u>');
    text = text.replace(/~~([^~\n]+)~~/g, '<s>$1</s>');
    text = text.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');

    text = text.replace(/\u0001(\d+)\u0002/g, (_, index) => protectedParts[Number(index)] || '');

    return text;
  }

  function renderDescription(value) {
    const source = String(value ?? '').replace(/\r\n?/g, '\n');
    if (!source) return '';

    return source.split('\n').map((line) => {
      // Headings MUST be checked before normal inline Markdown.
      // This strips the leading # symbols from the rendered output.
      const heading = line.match(/^\s*(#{1,3})\s+(.+?)\s*$/);
      if (heading) {
        const level = heading[1].length;
        const content = inlineMarkdown(heading[2]);
        return `<h${level}>${content}</h${level}>`;
      }

      const quote = line.match(/^\s*>\s?(.*)$/);
      if (quote) {
        return `<div class="gta-preview-quote">${inlineMarkdown(quote[1])}</div>`;
      }

      return line ? inlineMarkdown(line) : '<br>';
    }).join('<br>');
  }

  function getEmbedData() {
    const title = getValue('dee-title', 'Donation Price List');
    const description = String(getInput('dee-description')?.value ?? '');
    const color = normalizeColor(getValue('dee-color', '#2563EB'));
    const author = getValue('dee-author', 'GTA Pinas Treasury');
    const footer = getValue('dee-footer', 'GTA Pinas Treasury');
    const image = safeUrl(getInput('dee-image')?.value || '');
    const thumbnail = safeUrl(getInput('dee-thumbnail')?.value || '');

    return {
      title,
      description,
      color,
      author,
      footer,
      image,
      thumbnail,
    };
  }

  function formatTime() {
    return new Date().toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  function renderPreview() {
    const box = getInput(PREVIEW_ID);
    if (!box) return false;

    const data = getEmbedData();
    const descriptionHtml = renderDescription(data.description);

    const thumbnailHtml = data.thumbnail
      ? `<img class="gta-preview-thumb" src="${esc(data.thumbnail)}" alt="">`
      : '';

    const authorHtml = data.author
      ? `<div class="gta-preview-author">${thumbnailHtml ? '' : ''}<span>${esc(data.author)}</span></div>`
      : '';

    const titleHtml = data.title
      ? `<div class="gta-preview-title">${esc(data.title)}</div>`
      : '';

    const descriptionBlock = descriptionHtml
      ? `<div class="gta-preview-description">${descriptionHtml}</div>`
      : '';

    const imageHtml = data.image
      ? `<img class="gta-preview-image" src="${esc(data.image)}" alt="">`
      : '';

    const footerHtml = data.footer
      ? `<div class="gta-preview-footer"><span>${esc(data.footer)}</span></div>`
      : '';

    box.innerHTML = `
      <div class="gta-authoritative-discord-preview" ${AUTHORITATIVE_ATTR}="1">
        <div class="gta-preview-message">
          <div class="gta-preview-avatar">GP</div>
          <div class="gta-preview-main">
            <div class="gta-preview-meta">
              <span class="gta-preview-username">GTA Pinas Treasury</span>
              <span class="gta-preview-bot">BOT</span>
              <span class="gta-preview-time">Today at ${esc(formatTime())}</span>
            </div>

            <div class="gta-preview-embed" style="--gta-preview-accent:${esc(data.color)}">
              ${authorHtml}
              ${titleHtml}
              ${thumbnailHtml}
              ${descriptionBlock}
              ${imageHtml}
              ${footerHtml}
            </div>
          </div>
        </div>
      </div>`;

    return true;
  }

  function scheduleRender(delay = 0) {
    window.clearTimeout(scheduleRender.timer);
    scheduleRender.timer = window.setTimeout(() => {
      renderPreview();
    }, delay);
  }

  function bindInputs(root) {
    if (!root || root.dataset.gtaPreviewInputsBound === '1') return;
    root.dataset.gtaPreviewInputsBound = '1';

    const inputIds = [
      'dee-title',
      'dee-description',
      'dee-color',
      'dee-author',
      'dee-footer',
      'dee-image',
      'dee-thumbnail',
    ];

    inputIds.forEach((id) => {
      const input = document.getElementById(id);
      if (!input) return;

      input.addEventListener('input', () => scheduleRender(0));
      input.addEventListener('change', () => scheduleRender(0));
    });

    // Refresh/Load/Reset can replace preview DOM or populate inputs programmatically.
    root.addEventListener('click', (event) => {
      if (event.target?.closest?.('#dee-load-button, #dee-reset, #dee-preview-button')) {
        scheduleRender(180);
      }
    }, true);
  }

  function boot() {
    installStyles();

    const root = document.getElementById(ROOT_ID);
    if (!root) {
      window.setTimeout(boot, 100);
      return;
    }

    bindInputs(root);
    renderPreview();

    // The editor view is created dynamically. Re-bind when the view is rebuilt.
    if (!boot.observer) {
      boot.observer = new MutationObserver(() => {
        const currentRoot = document.getElementById(ROOT_ID);
        if (!currentRoot) return;

        installStyles();
        bindInputs(currentRoot);
        scheduleRender(50);
      });

      boot.observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }
  }

  // Expose an explicit renderer for the editor and other panel code.
  window.__gtaRenderDonationEmbedPreview = renderPreview;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
