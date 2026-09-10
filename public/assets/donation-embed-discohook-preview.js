(() => {
  'use strict';

  const state = {
    linkedEmbed: null,
    requestId: 0,
    observer: null,
    rootObserver: null,
    root: null,
    box: null,
    renderQueued: false,
    rendering: false,
  };

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
      if (Number.isSafeInteger(number) && number >= 0 && number <= 0xFFFFFF) return `#${number.toString(16).padStart(6, '0')}`;
    }
    return '#5865F2';
  };

  function inlineMarkdown(value) {
    let text = esc(value);
    const protectedParts = [];
    const protect = (html) => {
      const token = `\u0001${protectedParts.length}\u0002`;
      protectedParts.push(html);
      return token;
    };

    text = text.replace(/```([\s\S]*?)```/g, (_, code) => protect(`<pre class="dh-codeblock"><code>${code.trim()}</code></pre>`));
    text = text.replace(/`([^`\n]+)`/g, (_, code) => protect(`<code class="dh-code">${code}</code>`));
    text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, url) => protect(`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`));
    text = text.replace(/\|\|([\s\S]*?)\|\|/g, (_, content) => protect(`<span class="dh-spoiler">${content}</span>`));
    text = text.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/__([^_\n]+)__/g, '<u>$1</u>');
    text = text.replace(/~~([^~\n]+)~~/g, '<s>$1</s>');
    text = text.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
    text = text.replace(/\u0001(\d+)\u0002/g, (_, index) => protectedParts[Number(index)] || '');
    return text;
  }

  function discordText(value) {
    return String(value || '')
      .split('\n')
      .map((line) => line ? inlineMarkdown(line) : '<br>')
      .join('<br>');
  }

  function formData() {
    const value = (id) => document.getElementById(id)?.value || '';
    return {
      title: value('dee-title'),
      description: value('dee-description'),
      color: normalizeColor(value('dee-color')),
      image: safeUrl(value('dee-image')),
      thumbnail: safeUrl(value('dee-thumbnail')),
      author: value('dee-author'),
      footer: value('dee-footer'),
    };
  }

  function stripFlattenedFields(description, fields, originalDescription) {
    if (!Array.isArray(fields) || !fields.length) return description;
    const fieldBlock = fields.map((field) => `**${field.name || ''}**\n${field.value || ''}`).join('\n\n');
    const combined = `${originalDescription || ''}${originalDescription ? '\n\n' : ''}${fieldBlock}`;
    return String(description) === combined ? String(originalDescription || '') : String(description || '');
  }

  function effectiveEmbed() {
    const form = formData();
    const base = state.linkedEmbed || {};
    const fields = Array.isArray(base.fields) ? base.fields.filter((field) => field?.name || field?.value) : [];
    const description = state.linkedEmbed
      ? stripFlattenedFields(form.description, fields, String(base.description || ''))
      : form.description;

    return {
      ...base,
      title: form.title,
      description,
      color: form.color,
      url: safeUrl(base.url),
      author: form.author ? { ...(base.author || {}), name: form.author } : null,
      footer: form.footer ? { ...(base.footer || {}), text: form.footer } : null,
      image: form.image ? { ...(base.image || {}), url: form.image } : null,
      thumbnail: form.thumbnail ? { ...(base.thumbnail || {}), url: form.thumbnail } : null,
      fields,
    };
  }

  function formatMessageTime() {
    return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  function formatFooterTimestamp(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  function render() {
    const box = document.getElementById('dee-preview');
    if (!box || state.rendering) return;
    state.rendering = true;
    try {
      const embed = effectiveEmbed();
      const fields = embed.fields
        .map((field) => `<div class="dh-field${field.inline ? ' dh-inline' : ''}"><div class="dh-field-name">${inlineMarkdown(field.name || '')}</div><div class="dh-field-value">${discordText(field.value || '')}</div></div>`)
        .join('');
      const authorHtml = embed.author?.name
        ? `<div class="dh-author">${embed.author.icon_url ? `<img src="${esc(safeUrl(embed.author.icon_url))}" alt="">` : ''}<span>${esc(embed.author.name)}</span></div>`
        : '';
      const thumbnailHtml = embed.thumbnail?.url
        ? `<img class="dh-thumb" src="${esc(safeUrl(embed.thumbnail.url))}" alt="">`
        : '';
      const imageHtml = embed.image?.url
        ? `<img class="dh-image" src="${esc(safeUrl(embed.image.url))}" alt="">`
        : '';
      const footerTimestamp = embed.timestamp ? formatFooterTimestamp(embed.timestamp) : '';
      const footerContent = [String(embed.footer?.text || '').trim(), footerTimestamp].filter(Boolean).join(' • ');
      const footerHtml = footerContent
        ? `<div class="dh-footer">${embed.footer?.icon_url ? `<img src="${esc(safeUrl(embed.footer.icon_url))}" alt="">` : ''}<span>${esc(footerContent)}</span></div>`
        : '';
      const titleHtml = embed.title
        ? `<div class="dh-title${embed.url ? ' dh-link' : ''}">${esc(embed.title)}</div>`
        : '';
      const descriptionHtml = embed.description
        ? `<div class="dh-description">${discordText(embed.description)}</div>`
        : '';
      const contentHtml = [authorHtml, titleHtml, descriptionHtml, thumbnailHtml, fields ? `<div class="dh-fields">${fields}</div>` : '', imageHtml, footerHtml].filter(Boolean).join('');

      box.innerHTML = `
        <div class="dh-discord" data-dh-authoritative="1">
          <div class="dh-message">
            <div class="dh-avatar">GP</div>
            <div class="dh-main">
              <div class="dh-meta"><span class="dh-username">GTA Pinas Treasury</span><span class="dh-bot">BOT</span><span class="dh-time">Today at ${esc(formatMessageTime())}</span></div>
              <div class="dh-embed" style="--dh-accent:${esc(normalizeColor(embed.color))}">
                ${contentHtml || '<div class="dh-placeholder">Start typing to preview the Discord embed.</div>'}
              </div>
            </div>
          </div>
        </div>`;
    } finally {
      state.rendering = false;
    }
  }

  window.__gtaRenderDonationEmbedPreview = render;

  function scheduleRender() {
    if (state.renderQueued) return;
    state.renderQueued = true;
    window.requestAnimationFrame(() => {
      state.renderQueued = false;
      render();
    });
  }

  function observeBox() {
    const box = document.getElementById('dee-preview');
    if (!box || state.box === box) return;
    state.observer?.disconnect();
    state.box = box;
    state.observer = new MutationObserver(() => {
      if (state.rendering) return;
      if (box.firstElementChild?.getAttribute('data-dh-authoritative') !== '1') scheduleRender();
    });
    state.observer.observe(box, { childList: true, subtree: true });
  }

  function ensureRootObserver() {
    const root = document.getElementById('view-donation-embed-editor');
    if (!root || state.root === root) return;
    state.rootObserver?.disconnect();
    state.root = root;
    state.rootObserver = new MutationObserver(() => {
      observeBox();
      scheduleRender();
    });
    state.rootObserver.observe(root, { childList: true });
    root.addEventListener('input', scheduleRender, true);
    root.addEventListener('click', (event) => {
      const target = event.target;
      if (target?.closest?.('#dee-load-button')) window.setTimeout(loadLinked, 200);
      if (target?.closest?.('#dee-reset')) {
        state.linkedEmbed = null;
        window.setTimeout(render, 0);
      }
    }, true);
  }

  async function loadLinked() {
    const url = String(document.getElementById('dee-message-url')?.value || '').trim();
    if (!url) return;
    const id = ++state.requestId;
    try {
      const response = await fetch(`/api/donation/message?url=${encodeURIComponent(url)}`, { credentials: 'same-origin', cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (id !== state.requestId || !response.ok || !payload?.embed) return;
      state.linkedEmbed = payload.embed;
      render();
    } catch (_) {
      // Keep the editor usable if Discord lookup fails.
    }
  }

  function styles() {
    if (document.getElementById('dh-preview-styles')) return;
    const style = document.createElement('style');
    style.id = 'dh-preview-styles';
    style.textContent = `
      .gta-dee-preview{background:#1e1f22!important;border-color:#303236!important}
      .gta-discord{background:#313338!important;border-radius:8px!important;padding:16px!important;min-height:430px!important;color:#dbdee1;font-family:Arial,Helvetica,sans-serif;box-sizing:border-box}
      .dh-message{display:grid;grid-template-columns:40px minmax(0,1fr);gap:12px;align-items:start}.dh-avatar{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;background:#5865f2;color:#fff;font-size:12px;font-weight:800}.dh-main{min-width:0}
      .dh-meta{height:24px;display:flex;align-items:center;gap:6px;white-space:nowrap}.dh-username{font-size:16px;line-height:20px;font-weight:600;color:#f2f3f5}.dh-bot{font-size:10px;line-height:16px;padding:0 4px;border-radius:3px;background:#5865f2;color:#fff;font-weight:700}.dh-time{font-size:12px;color:#949ba4}
      .dh-embed{position:relative;width:min(516px,100%);background:#2b2d31;border-left:4px solid var(--dh-accent);border-radius:4px;padding:8px 16px 10px 12px;box-sizing:border-box;overflow:hidden}.dh-author{display:flex;align-items:center;gap:6px;color:#b5bac1;font-size:12px;font-weight:600;line-height:16px;margin-bottom:4px}.dh-author img{width:20px;height:20px;border-radius:50%;object-fit:cover}.dh-title{font-size:16px;line-height:21px;font-weight:600;color:#f2f3f5;word-break:break-word;margin-bottom:4px}.dh-title.dh-link{color:#00a8fc}.dh-description{font-size:14px;line-height:19px;color:#dbdee1;word-break:break-word}.dh-description a,.dh-field-value a{color:#00a8fc;text-decoration:none}.dh-description strong,.dh-field-value strong{font-weight:700}.dh-description em,.dh-field-value em{font-style:italic}.dh-description u,.dh-field-value u{text-decoration:underline}.dh-description s,.dh-field-value s{text-decoration:line-through}
      .dh-code{background:#1e1f22;border:1px solid #3f4147;border-radius:3px;padding:1px 4px;font-family:Consolas,monospace;font-size:12px}.dh-codeblock{display:block;background:#1e1f22;border-radius:4px;padding:8px;white-space:pre-wrap;font-family:Consolas,monospace;font-size:12px;line-height:17px;margin:5px 0;overflow:auto}.dh-spoiler{background:#202225;color:transparent;border-radius:3px;padding:0 2px}.dh-spoiler:hover{color:#dbdee1}
      .dh-thumb{float:right;width:80px;height:80px;object-fit:cover;border-radius:4px;margin:0 0 8px 16px}.dh-fields{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:12px 16px;margin-top:16px}.dh-field{grid-column:1/-1;min-width:0}.dh-field.dh-inline{grid-column:span 4}.dh-field-name{font-size:12px;line-height:16px;font-weight:700;color:#f2f3f5;word-break:break-word}.dh-field-value{font-size:14px;line-height:19px;color:#dbdee1;word-break:break-word}.dh-image{display:block;width:auto;max-width:100%;max-height:400px;object-fit:contain;border-radius:4px;margin-top:16px}.dh-footer{display:flex;align-items:center;gap:5px;color:#949ba4;font-size:11px;line-height:14px;margin-top:8px;clear:both}.dh-footer img{width:20px;height:20px;border-radius:50%;object-fit:cover}.dh-placeholder{color:#949ba4;font-size:13px;padding:4px 0}
      @media(max-width:620px){.dh-field.dh-inline{grid-column:1/-1}}
    `;
    document.head.appendChild(style);
  }

  function init() {
    styles();
    ensureRootObserver();
    observeBox();
    loadLinked();
    render();
    const timer = window.setInterval(() => { ensureRootObserver(); observeBox(); }, 500);
    window.setTimeout(() => window.clearInterval(timer), 30000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
