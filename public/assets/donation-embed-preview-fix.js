(() => {
  'use strict';

  /*
   * Authoritative renderer for the Donation Embed Editor preview.
   *
   * This file intentionally renders the complete preview instead of trying
   * to patch individual nodes produced by another renderer. That prevents
   * headings, title, author, footer, images, and color from getting lost.
   */

  const ROOT_ID = 'view-donation-embed-editor';
  const PREVIEW_ID = 'dee-preview';
  const STYLE_ID = 'gta-donation-preview-authoritative-styles';
  const AUTHORITATIVE_ATTR = 'data-dh-authoritative';

  const INPUT_IDS = new Set([
    'dee-title',
    'dee-description',
    'dee-color',
    'dee-author',
    'dee-footer',
    'dee-image',
    'dee-thumbnail',
  ]);

  let renderTimer = null;
  let bootTimer = null;

  const esc = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  function safeUrl(value) {
    try {
      const url = new URL(String(value || '').trim());
      return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
    } catch (_) {
      return '';
    }
  }

  function normalizeColor(value) {
    const raw = String(value ?? '').trim();

    if (/^#[0-9a-f]{6}$/i.test(raw)) return raw;

    if (/^\d+$/.test(raw)) {
      const number = Number(raw);
      if (Number.isSafeInteger(number) && number >= 0 && number <= 0xFFFFFF) {
        return `#${number.toString(16).padStart(6, '0')}`;
      }
    }

    return '#5865F2';
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${PREVIEW_ID} .gta-authoritative-preview {
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
        display: block;
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

      #${PREVIEW_ID} .gta-preview-description strong { font-weight: 700; }
      #${PREVIEW_ID} .gta-preview-description em { font-style: italic; }
      #${PREVIEW_ID} .gta-preview-description u { text-decoration: underline; }
      #${PREVIEW_ID} .gta-preview-description s { text-decoration: line-through; }

      #${PREVIEW_ID} .gta-preview-link {
        color: #00a8fc;
        text-decoration: none;
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
        padding: 0 2px;
        border-radius: 3px;
        background: #202225;
        color: transparent;
        cursor: pointer;
      }

      #${PREVIEW_ID} .gta-preview-spoiler:hover {
        color: #dbdee1;
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

      #${PREVIEW_ID} .gta-preview-placeholder {
        color: #949ba4;
        font-size: 13px;
        line-height: 19px;
      }
    `;

    document.head.appendChild(style);
  }

  function inputValue(id, fallback = '') {
    const element = document.getElementById(id);
    if (!element) return fallback;
    const value = String(element.value ?? '').trim();
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

    text = text.replace(/```([\s\S]*?)```/g, (_, code) => protect(
      `<pre style="margin:5px 0;padding:8px;border-radius:4px;background:#1e1f22;white-space:pre-wrap;font-family:Consolas,Monaco,monospace;font-size:12px;line-height:17px;overflow:auto"><code>${code.trim()}</code></pre>`
    ));

    text = text.replace(/`([^`\n]+)`/g, (_, code) => protect(
      `<code class="gta-preview-code">${code}</code>`
    ));

    text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, url) => protect(
      `<a class="gta-preview-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`
    ));

    text = text.replace(/\|\|([\s\S]*?)\|\|/g, (_, content) => protect(
      `<span class="gta-preview-spoiler">${content}</span>`
    ));

    text = text.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/__([^_\n]+)__/g, '<u>$1</u>');
    text = text.replace(/~~([^~\n]+)~~/g, '<s>$1</s>');
    text = text.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');

    return text.replace(/\u0001(\d+)\u0002/g, (_, index) => (
      protectedParts[Number(index)] || ''
    ));
  }

  function renderDescription(value) {
    const source = String(value ?? '').replace(/\r\n?/g, '\n');
    if (!source) return '';

    return source.split('\n').map((line) => {
      // Discord heading syntax is line-based: #, ##, or ### followed by a space.
      // The regex removes the hashes from the output and keeps only the heading text.
      const heading = line.match(/^\s*(#{1,3})\s+(.+?)\s*$/);
      if (heading) {
        const level = heading[1].length;
        const headingText = inlineMarkdown(heading[2]);
        return `<h${level}>${headingText}</h${level}>`;
      }

      const quote = line.match(/^\s*>\s?(.*)$/);
      if (quote) {
        return `<div class="gta-preview-quote">${inlineMarkdown(quote[1])}</div>`;
      }

      return line ? inlineMarkdown(line) : '<br>';
    }).join('<br>');
  }

  function getData() {
    return {
      // Use the field's placeholder text as the initial preview value so the
      // preview does not appear to ignore these configured defaults.
      title: inputValue('dee-title', 'Donation Price List'),
      description: String(document.getElementById('dee-description')?.value ?? ''),
      color: normalizeColor(inputValue('dee-color', '#2563EB')),
      author: inputValue('dee-author', 'GTA Pinas Treasury'),
      footer: inputValue('dee-footer', 'GTA Pinas Treasury'),
      image: safeUrl(document.getElementById('dee-image')?.value || ''),
      thumbnail: safeUrl(document.getElementById('dee-thumbnail')?.value || ''),
    };
  }

  function renderPreview() {
    installStyles();

    const box = document.getElementById(PREVIEW_ID);
    if (!box) return false;

    const data = getData();
    const description = renderDescription(data.description);

    const authorHtml = data.author
      ? `<div class="gta-preview-author">${esc(data.author)}</div>`
      : '';

    const titleHtml = data.title
      ? `<div class="gta-preview-title">${esc(data.title)}</div>`
      : '';

    const thumbnailHtml = data.thumbnail
      ? `<img class="gta-preview-thumb" src="${esc(data.thumbnail)}" alt="">`
      : '';

    const descriptionHtml = description
      ? `<div class="gta-preview-description">${description}</div>`
      : `<div class="gta-preview-placeholder">Start typing to preview the embed.</div>`;

    const imageHtml = data.image
      ? `<img class="gta-preview-image" src="${esc(data.image)}" alt="">`
      : '';

    const footerHtml = data.footer
      ? `<div class="gta-preview-footer">${esc(data.footer)}</div>`
      : '';

    box.innerHTML = `
      <div class="gta-authoritative-preview" ${AUTHORITATIVE_ATTR}="1">
        <div class="gta-preview-message">
          <div class="gta-preview-avatar">GP</div>
          <div class="gta-preview-main">
            <div class="gta-preview-meta">
              <span class="gta-preview-username">GTA Pinas Treasury</span>
              <span class="gta-preview-bot">BOT</span>
              <span class="gta-preview-time">Today at ${esc(new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }))}</span>
            </div>

            <div class="gta-preview-embed" style="--gta-preview-accent:${esc(data.color)}">
              ${authorHtml}
              ${titleHtml}
              ${thumbnailHtml}
              ${descriptionHtml}
              ${imageHtml}
              ${footerHtml}
            </div>
          </div>
        </div>
      </div>`;

    return true;
  }

  function scheduleRender(delay = 100) {
    window.clearTimeout(renderTimer);
    renderTimer = window.setTimeout(() => {
      renderPreview();
    }, delay);
  }

  function bindRoot(root) {
    if (!root || root.dataset.gtaAuthoritativePreviewBound === '1') return;
    root.dataset.gtaAuthoritativePreviewBound = '1';

    // Event delegation means dynamically-created editor inputs are supported too.
    root.addEventListener('input', (event) => {
      const target = event.target;
      if (!target?.id || !INPUT_IDS.has(target.id)) return;
      // Delay slightly so the other preview renderer cannot overwrite this
      // authoritative render in the same input event/animation frame.
      scheduleRender(100);
    }, true);

    root.addEventListener('change', (event) => {
      const target = event.target;
      if (!target?.id || !INPUT_IDS.has(target.id)) return;
      scheduleRender(100);
    }, true);

    root.addEventListener('click', (event) => {
      if (event.target?.closest?.('#dee-load-button, #dee-reset, #dee-preview-button')) {
        scheduleRender(250);
      }
    }, true);
  }

  function boot() {
    installStyles();

    const root = document.getElementById(ROOT_ID);
    if (root) {
      bindRoot(root);
      renderPreview();
      window.clearTimeout(bootTimer);
      return;
    }

    // The Embed Editor is created dynamically by donation-embed-editor.js.
    window.clearTimeout(bootTimer);
    bootTimer = window.setTimeout(boot, 100);
  }

  // Other panel code can explicitly request the authoritative renderer.
  window.__gtaRenderDonationEmbedPreview = renderPreview;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
