(() => {
  'use strict';

  const ROOT_ID = 'view-donation-embed-editor';
  const PREVIEW_ID = 'dee-preview';
  const STYLE_ID = 'gta-donation-editor-enhancements';
  let renderTimer = null;
  let bootTimer = null;
  let boundRoot = null;

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
    if (/^#[0-9a-f]{6}$/i.test(raw)) return raw.toUpperCase();
    if (/^\d+$/.test(raw)) {
      const number = Number(raw);
      if (Number.isSafeInteger(number) && number >= 0 && number <= 0xFFFFFF) {
        return `#${number.toString(16).padStart(6, '0').toUpperCase()}`;
      }
    }
    return '#2563EB';
  };

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${ROOT_ID} .gta-dee-link{display:flex;align-items:flex-end;gap:8px;margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid var(--border)}
      #${ROOT_ID} .gta-dee-link .gta-dee-field{flex:1 1 auto;min-width:0}
      #${ROOT_ID} .gta-dee-link .gta-dee-field>input{height:40px;padding-top:0;padding-bottom:0;box-sizing:border-box}
      #${ROOT_ID} .gta-dee-link button{flex:0 0 auto;height:40px;min-width:110px;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;padding:0 14px}
      #${ROOT_ID} .gta-dee-color-control{display:flex;align-items:center;gap:8px;width:100%}
      #${ROOT_ID} .gta-dee-color-text{flex:1 1 auto;min-width:0;height:40px!important;box-sizing:border-box}
      #${ROOT_ID} .gta-dee-color-picker{width:40px!important;height:40px!important;flex:0 0 40px;padding:3px!important;border-radius:7px!important;cursor:pointer;background:var(--bg-main)!important;box-sizing:border-box}
      #${ROOT_ID} .gta-dee-color-picker::-webkit-color-swatch-wrapper{padding:0}
      #${ROOT_ID} .gta-dee-color-picker::-webkit-color-swatch,#${ROOT_ID} .gta-dee-color-picker::-moz-color-swatch{border:0;border-radius:4px}
      #${ROOT_ID} #${PREVIEW_ID} .gta-preview-description{font-size:11px;line-height:1.55;color:#dbdee1;overflow-wrap:anywhere}
      #${ROOT_ID} #${PREVIEW_ID} .gta-preview-description h1,#${ROOT_ID} #${PREVIEW_ID} .gta-preview-description h2,#${ROOT_ID} #${PREVIEW_ID} .gta-preview-description h3{margin:0 0 7px;font-weight:700;line-height:1.3}
      #${ROOT_ID} #${PREVIEW_ID} .gta-preview-description h1{font-size:20px}
      #${ROOT_ID} #${PREVIEW_ID} .gta-preview-description h2{font-size:17px}
      #${ROOT_ID} #${PREVIEW_ID} .gta-preview-description h3{font-size:14px}
      #${ROOT_ID} #${PREVIEW_ID} .gta-preview-description p{margin:0}
      #${ROOT_ID} #${PREVIEW_ID} .gta-preview-description br{line-height:1.55}
      #${ROOT_ID} #${PREVIEW_ID} .gta-preview-description blockquote{margin:4px 0;padding-left:8px;border-left:3px solid #4e5058;color:#b5bac1}
      #${ROOT_ID} #${PREVIEW_ID} .gta-preview-description code{padding:1px 4px;border-radius:3px;background:#1e1f22;color:#f2f3f5}
      #${ROOT_ID} #${PREVIEW_ID} .gta-preview-description pre{margin:5px 0;padding:8px;border-radius:5px;background:#1e1f22;overflow:auto}
      #${ROOT_ID} #${PREVIEW_ID} .gta-preview-description a{color:#00a8fc;text-decoration:none}
      #${ROOT_ID} #${PREVIEW_ID} .gta-preview-title{font-size:16px;font-weight:700;line-height:1.3;margin:0 0 6px;color:#fff}
      #${ROOT_ID} #${PREVIEW_ID} .gta-preview-author{font-size:10px;font-weight:700;margin-bottom:7px;color:#fff}
      #${ROOT_ID} #${PREVIEW_ID} .gta-preview-footer{display:block;margin-top:10px;color:#949ba4;font-size:10px}
      #${ROOT_ID} #${PREVIEW_ID} .gta-preview-thumb{float:right;width:76px;height:76px;object-fit:cover;margin:0 0 7px 9px;border-radius:4px}
      #${ROOT_ID} #${PREVIEW_ID} .gta-preview-image{max-width:100%;border-radius:4px;margin-top:9px;display:block}
    `;
    document.head.appendChild(style);
  }

  function value(id, fallback = '') {
    return document.getElementById(id)?.value ?? fallback;
  }

  function inlineMarkdown(text) {
    let out = esc(text);
    out = out.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    out = out.replace(/\|\|([^|\n]+)\|\|/g, '<span style="background:#202225;color:transparent;border-radius:3px">$1</span>');
    out = out.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/__([^_\n]+)__/g, '<u>$1</u>');
    out = out.replace(/~~([^~\n]+)~~/g, '<s>$1</s>');
    out = out.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
    out = out.replace(/(^|[^_])_([^_\n]+)_(?!_)/g, '$1<em>$2</em>');
    return out;
  }

  function renderDescription(raw) {
    const lines = String(raw ?? '').replace(/\r\n?/g, '\n').split('\n');
    let html = '';
    let inCode = false;
    let codeLines = [];
    const flushCode = () => {
      if (!inCode) return;
      html += `<pre><code>${esc(codeLines.join('\n'))}</code></pre>`;
      codeLines = [];
      inCode = false;
    };

    lines.forEach((line) => {
      if (/^\s*```/.test(line)) {
        if (inCode) flushCode(); else inCode = true;
        return;
      }
      if (inCode) {
        codeLines.push(line);
        return;
      }
      if (!line.trim()) {
        html += '<br>';
        return;
      }
      const heading = line.match(/^\s*(#{1,3})\s+(.+?)\s*$/);
      if (heading) {
        const level = heading[1].length;
        html += `<h${level}>${inlineMarkdown(heading[2])}</h${level}>`;
        return;
      }
      if (/^\s*>\s?/.test(line)) {
        html += `<blockquote>${inlineMarkdown(line.replace(/^\s*>\s?/, ''))}</blockquote>`;
        return;
      }
      html += `${inlineMarkdown(line)}<br>`;
    });

    flushCode();
    return html.replace(/(<br>)+$/, '');
  }

  function getData() {
    return {
      title: value('dee-title', 'Donation Price List') || 'Donation Price List',
      description: value('dee-description'),
      color: normalizeColor(value('dee-color', '#2563EB')),
      author: value('dee-author', 'GTA Pinas Treasury') || 'GTA Pinas Treasury',
      footer: value('dee-footer', 'GTA Pinas Treasury') || 'GTA Pinas Treasury',
      image: value('dee-image'),
      thumbnail: value('dee-thumbnail'),
    };
  }

  function renderPreview() {
    const box = document.getElementById(PREVIEW_ID);
    if (!box) return;
    const data = getData();
    const image = safeUrl(data.image);
    const thumb = safeUrl(data.thumbnail);
    box.setAttribute('data-dh-authoritative', '1');
    box.innerHTML = `
      <div class="gta-user"><div class="gta-avatar">GP</div><div><strong>GTA Pinas Treasury</strong><span>Today</span></div></div>
      <div class="gta-embed" style="border-left-color:${esc(data.color)}">
        ${thumb ? `<img class="gta-preview-thumb" src="${esc(thumb)}" alt="">` : ''}
        ${data.author ? `<div class="gta-preview-author">${esc(data.author)}</div>` : ''}
        ${data.title ? `<div class="gta-preview-title">${esc(data.title)}</div>` : ''}
        <div class="gta-preview-description">${renderDescription(data.description) || '<span style="color:#949ba4">Start typing to preview the embed.</span>'}</div>
        ${image ? `<img class="gta-preview-image" src="${esc(image)}" alt="">` : ''}
        ${data.footer ? `<small class="gta-preview-footer">${esc(data.footer)}</small>` : ''}
      </div>`;
  }

  function scheduleRender(delay = 100) {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(renderPreview, delay);
  }

  function syncColorControls(color, render = true) {
    const normalized = normalizeColor(color);
    const text = document.getElementById('dee-color');
    const picker = document.getElementById('dee-color-picker');
    if (text && text.value !== normalized) text.value = normalized;
    if (picker && picker.value !== normalized) picker.value = normalized;
    if (render) scheduleRender(50);
  }

  function enhanceColorControl(root) {
    const field = root.querySelector('#dee-color')?.closest('.gta-dee-field');
    const text = root.querySelector('#dee-color');
    if (!field || !text || root.querySelector('#dee-color-picker')) return;

    text.classList.add('gta-dee-color-text');
    const control = document.createElement('div');
    control.className = 'gta-dee-color-control';
    text.parentNode.insertBefore(control, text);
    control.appendChild(text);

    const picker = document.createElement('input');
    picker.type = 'color';
    picker.id = 'dee-color-picker';
    picker.className = 'gta-dee-color-picker';
    picker.value = normalizeColor(text.value);
    control.appendChild(picker);

    text.addEventListener('input', () => {
      const raw = String(text.value || '').trim();
      if (/^#[0-9a-f]{6}$/i.test(raw) || /^\d+$/.test(raw)) syncColorControls(raw);
      else scheduleRender(50);
    });
    text.addEventListener('blur', () => syncColorControls(text.value));
    picker.addEventListener('input', () => syncColorControls(picker.value));
    picker.addEventListener('change', () => syncColorControls(picker.value));

    syncColorControls(text.value, false);
  }

  function bindRoot(root) {
    if (boundRoot === root) return;
    boundRoot = root;
    enhanceColorControl(root);

    root.addEventListener('input', (event) => {
      if (event.target.matches('#dee-title,#dee-description,#dee-author,#dee-footer,#dee-image,#dee-thumbnail')) {
        scheduleRender(0);
      }
    });
    root.addEventListener('change', (event) => {
      if (event.target.matches('#dee-title,#dee-description,#dee-color,#dee-author,#dee-footer,#dee-image,#dee-thumbnail')) {
        scheduleRender(0);
      }
    });
    root.addEventListener('click', (event) => {
      if (event.target.closest('#dee-load-button,#dee-reset,#dee-preview-button')) scheduleRender(0);
    });
    scheduleRender(0);
  }

  function boot() {
    installStyles();
    const root = document.getElementById(ROOT_ID);
    if (root) {
      bindRoot(root);
      return;
    }
    clearTimeout(bootTimer);
    bootTimer = setTimeout(boot, 100);
  }

  window.__gtaRenderDonationEmbedPreview = renderPreview;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
