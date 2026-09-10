(() => {
  'use strict';

  const state = { linkedEmbed: null, loadBound: false };

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

  function normalizeColor(value) {
    const raw = String(value ?? '').trim();
    if (/^#[0-9a-f]{6}$/i.test(raw)) return raw;
    if (/^\d+$/.test(raw)) {
      const number = Number(raw);
      if (Number.isSafeInteger(number) && number >= 0 && number <= 0xFFFFFF) {
        return `#${number.toString(16).padStart(6, '0').toUpperCase()}`;
      }
    }
    return '#5865F2';
  }

  function inlineMarkdown(value) {
    let text = esc(value);
    const protectedParts = [];
    const protect = (html) => {
      const token = `\u0001${protectedParts.length}\u0002`;
      protectedParts.push(html);
      return token;
    };

    text = text.replace(/```([\s\S]*?)```/g, (_, code) => protect(`<pre class="gta-preview-codeblock"><code>${code.trim()}</code></pre>`));
    text = text.replace(/`([^`\n]+)`/g, (_, code) => protect(`<code class="gta-preview-code">${code}</code>`));
    text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, url) => protect(`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`));
    text = text.replace(/\|\|([^|\n]+)\|\|/g, (_, value) => protect(`<span class="gta-preview-spoiler">${value}</span>`));
    text = text.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/__([^_\n]+)__/g, '<u>$1</u>');
    text = text.replace(/~~([^~\n]+)~~/g, '<s>$1</s>');
    text = text.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
    text = text.replace(/\u0001(\d+)\u0002/g, (_, index) => protectedParts[Number(index)] || '');
    return text;
  }

  function renderMarkdown(value) {
    const lines = String(value || '').split('\n');
    const output = [];
    let listOpen = false;
    const closeList = () => {
      if (listOpen) {
        output.push('</ul>');
        listOpen = false;
      }
    };

    lines.forEach((raw) => {
      const trimmed = raw.trim();
      if (!trimmed) {
        closeList();
        output.push('<div class="gta-preview-gap"></div>');
        return;
      }

      if (/^[-*]\s+/.test(trimmed)) {
        if (!listOpen) {
          output.push('<ul class="gta-preview-list">');
          listOpen = true;
        }
        output.push(`<li>${inlineMarkdown(trimmed.replace(/^[-*]\s+/, ''))}</li>`);
        return;
      }

      closeList();
      if (/^#{1,3}\s+/.test(trimmed)) {
        output.push(`<div class="gta-preview-heading">${inlineMarkdown(trimmed.replace(/^#{1,3}\s+/, ''))}</div>`);
      } else if (/^>\s?/.test(trimmed)) {
        output.push(`<div class="gta-preview-quote">${inlineMarkdown(trimmed.replace(/^>\s?/, ''))}</div>`);
      } else {
        output.push(`<div class="gta-preview-line">${inlineMarkdown(trimmed)}</div>`);
      }
    });

    closeList();
    return output.join('');
  }

  function getForm() {
    const value = (id, fallback = '') => document.getElementById(id)?.value ?? fallback;
    return {
      title: value('dee-title'),
      description: value('dee-description'),
      color: normalizeColor(value('dee-color', '#5865F2')),
      image: safeUrl(value('dee-image')),
      thumbnail: safeUrl(value('dee-thumbnail')),
      author: value('dee-author'),
      footer: value('dee-footer'),
    };
  }

  function fieldHtml(field) {
    return `
      <div class="gta-preview-field${field.inline ? ' is-inline' : ''}">
        <div class="gta-preview-field-name">${inlineMarkdown(field.name || '')}</div>
        <div class="gta-preview-field-value">${renderMarkdown(field.value || '')}</div>
      </div>`;
  }

  function render() {
    const box = document.getElementById('dee-preview');
    if (!box) return false;

    const form = getForm();
    const embed = state.linkedEmbed || {};
    const fields = Array.isArray(embed.fields) ? embed.fields.filter((field) => field?.name || field?.value) : [];
    const description = state.linkedEmbed ? String(embed.description || '') : form.description;
    const title = state.linkedEmbed ? String(embed.title || form.title) : form.title;
    const author = form.author || String(embed.author?.name || '');
    const footer = form.footer || String(embed.footer?.text || '');
    const color = normalizeColor(form.color || embed.color);
    const image = form.image || safeUrl(embed.image?.url);
    const thumbnail = form.thumbnail || safeUrl(embed.thumbnail?.url);

    box.innerHTML = `
      <div class="gta-preview-message">
        <div class="gta-preview-avatar">GP</div>
        <div class="gta-preview-user">
          <strong>GTA Pinas Treasury</strong>
          <span>Today at ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
        </div>
      </div>
      <div class="gta-preview-embed" style="border-left-color:${esc(color)}">
        ${thumbnail ? `<img class="gta-preview-thumb" src="${esc(thumbnail)}" alt="">` : ''}
        ${author ? `<div class="gta-preview-author">${esc(author)}</div>` : ''}
        ${title ? `<div class="gta-preview-title">${esc(title)}</div>` : ''}
        ${description ? `<div class="gta-preview-description">${renderMarkdown(description)}</div>` : ''}
        ${fields.length ? `<div class="gta-preview-fields">${fields.map(fieldHtml).join('')}</div>` : ''}
        ${image ? `<img class="gta-preview-image" src="${esc(image)}" alt="">` : ''}
        ${footer ? `<div class="gta-preview-footer">${esc(footer)}</div>` : ''}
      </div>`;
    return true;
  }

  async function captureLinkedEmbed() {
    const input = document.getElementById('dee-message-url');
    const url = String(input?.value || '').trim();
    if (!url) return;

    try {
      const response = await fetch(`/api/donation/message?url=${encodeURIComponent(url)}`, {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.embed) return;

      state.linkedEmbed = payload.embed;

      const color = document.getElementById('dee-color');
      if (color) color.value = normalizeColor(payload.embed.color);

      const description = document.getElementById('dee-description');
      if (description) description.value = payload.embed.description || '';

      const title = document.getElementById('dee-title');
      if (title) title.value = payload.embed.title || '';

      const image = document.getElementById('dee-image');
      if (image) image.value = payload.embed.image?.url || '';

      const thumbnail = document.getElementById('dee-thumbnail');
      if (thumbnail) thumbnail.value = payload.embed.thumbnail?.url || '';

      const author = document.getElementById('dee-author');
      if (author) author.value = payload.embed.author?.name || '';

      const footer = document.getElementById('dee-footer');
      if (footer) footer.value = payload.embed.footer?.text || '';

      render();
    } catch (_) {
      // The main editor will still show its own status message.
    }
  }

  function bind() {
    if (state.loadBound) return;
    state.loadBound = true;

    const rerenderIds = ['dee-title', 'dee-description', 'dee-color', 'dee-image', 'dee-thumbnail', 'dee-author', 'dee-footer'];
    rerenderIds.forEach((id) => document.getElementById(id)?.addEventListener('input', () => {
      if (id === 'dee-description' && state.linkedEmbed) state.linkedEmbed = { ...state.linkedEmbed, description: document.getElementById(id).value };
      if (id === 'dee-title' && state.linkedEmbed) state.linkedEmbed = { ...state.linkedEmbed, title: document.getElementById(id).value };
      if (id === 'dee-color' && state.linkedEmbed) state.linkedEmbed = { ...state.linkedEmbed, color: normalizeColor(document.getElementById(id).value) };
      if (id === 'dee-image' && state.linkedEmbed) state.linkedEmbed = { ...state.linkedEmbed, image: { url: document.getElementById(id).value } };
      if (id === 'dee-thumbnail' && state.linkedEmbed) state.linkedEmbed = { ...state.linkedEmbed, thumbnail: { url: document.getElementById(id).value } };
      if (id === 'dee-author' && state.linkedEmbed) state.linkedEmbed = { ...state.linkedEmbed, author: { ...(state.linkedEmbed.author || {}), name: document.getElementById(id).value } };
      if (id === 'dee-footer' && state.linkedEmbed) state.linkedEmbed = { ...state.linkedEmbed, footer: { ...(state.linkedEmbed.footer || {}), text: document.getElementById(id).value } };
      render();
    }));

    document.getElementById('dee-load-button')?.addEventListener('click', () => {
      window.setTimeout(captureLinkedEmbed, 100);
    });

    document.getElementById('dee-preview-button')?.addEventListener('click', render);
    captureLinkedEmbed();
    render();
  }

  function init() {
    const timer = window.setInterval(() => {
      if (document.getElementById('view-donation-embed-editor') && document.getElementById('dee-preview')) {
        window.clearInterval(timer);
        bind();
      }
    }, 150);
    window.setTimeout(() => window.clearInterval(timer), 15000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
