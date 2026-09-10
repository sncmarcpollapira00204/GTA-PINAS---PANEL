(() => {
  'use strict';

  const state = {
    embed: null,
    requestId: 0,
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

  const colorHex = (value) => {
    const raw = String(value ?? '').trim();
    if (/^#[0-9a-f]{6}$/i.test(raw)) return raw;
    const n = Number(raw);
    if (Number.isSafeInteger(n) && n >= 0 && n <= 0xFFFFFF) return `#${n.toString(16).padStart(6, '0')}`;
    return '#5865F2';
  };

  function markdownInline(value) {
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
    text = text.replace(/\|\|([^|\n]+)\|\|/g, (_, value) => protect(`<span class="dh-spoiler">${value}</span>`));
    text = text.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/__([^_\n]+)__/g, '<u>$1</u>');
    text = text.replace(/~~([^~\n]+)~~/g, '<s>$1</s>');
    text = text.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
    text = text.replace(/\u0001(\d+)\u0002/g, (_, index) => protectedParts[Number(index)] || '');
    return text;
  }

  function markdown(value) {
    const lines = String(value || '').split('\n');
    let html = '';
    let inList = false;
    const closeList = () => {
      if (inList) { html += '</ul>'; inList = false; }
    };

    lines.forEach((raw) => {
      const line = raw.trim();
      if (!line) { closeList(); html += '<div class="dh-gap"></div>'; return; }
      if (/^[-*]\s+/.test(line)) {
        if (!inList) { html += '<ul class="dh-list">'; inList = true; }
        html += `<li>${markdownInline(line.replace(/^[-*]\s+/, ''))}</li>`;
        return;
      }
      closeList();
      if (/^#{1,3}\s+/.test(line)) html += `<div class="dh-heading">${markdownInline(line.replace(/^#{1,3}\s+/, ''))}</div>`;
      else if (/^>\s?/.test(line)) html += `<div class="dh-quote">${markdownInline(line.replace(/^>\s?/, ''))}</div>`;
      else html += `<div class="dh-line">${markdownInline(line)}</div>`;
    });
    closeList();
    return html;
  }

  function formData() {
    const value = (id) => document.getElementById(id)?.value || '';
    return {
      title: value('dee-title'),
      description: value('dee-description'),
      color: colorHex(value('dee-color')),
      image: safeUrl(value('dee-image')),
      thumbnail: safeUrl(value('dee-thumbnail')),
      author: value('dee-author'),
      footer: value('dee-footer'),
    };
  }

  function render() {
    const box = document.getElementById('dee-preview');
    if (!box) return;

    const form = formData();
    const embed = state.embed || {};
    const fields = Array.isArray(embed.fields) ? embed.fields.filter((field) => field?.name || field?.value) : [];
    const title = state.embed ? String(embed.title || form.title) : form.title;
    const description = state.embed ? String(embed.description || '') : form.description;
    const author = form.author || String(embed.author?.name || '');
    const footer = form.footer || String(embed.footer?.text || '');
    const image = form.image || safeUrl(embed.image?.url);
    const thumbnail = form.thumbnail || safeUrl(embed.thumbnail?.url);
    const color = colorHex(form.color || embed.color);
    const timestamp = embed.timestamp ? new Date(embed.timestamp) : null;
    const timeText = timestamp && !Number.isNaN(timestamp.getTime())
      ? timestamp.toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
      : 'Today';

    const fieldHtml = fields.map((field) => `
      <div class="dh-field${field.inline ? ' dh-inline' : ''}">
        <div class="dh-field-name">${markdownInline(field.name || '')}</div>
        <div class="dh-field-value">${markdown(field.value || '')}</div>
      </div>`).join('');

    box.innerHTML = `
      <div class="dh-message">
        <div class="dh-avatar">GP</div>
        <div class="dh-message-main">
          <div class="dh-message-meta">
            <span class="dh-username">GTA Pinas Treasury</span>
            <span class="dh-bot">BOT</span>
            <span class="dh-time">${esc(timeText)}</span>
          </div>
          <div class="dh-embed" style="--dh-accent:${esc(color)}">
            ${author ? `<div class="dh-author">${esc(author)}</div>` : ''}
            ${title ? `<div class="dh-title">${esc(title)}</div>` : ''}
            ${description ? `<div class="dh-description">${markdown(description)}</div>` : ''}
            ${thumbnail ? `<img class="dh-thumb" src="${esc(thumbnail)}" alt="">` : ''}
            ${fieldHtml ? `<div class="dh-fields">${fieldHtml}</div>` : ''}
            ${image ? `<img class="dh-image" src="${esc(image)}" alt="">` : ''}
            ${footer ? `<div class="dh-footer">${esc(footer)}</div>` : ''}
          </div>
        </div>
      </div>`;
  }

  async function loadLinked() {
    const input = document.getElementById('dee-message-url');
    const url = String(input?.value || '').trim();
    if (!url) return;
    const id = ++state.requestId;
    try {
      const response = await fetch(`/api/donation/message?url=${encodeURIComponent(url)}`, { credentials: 'same-origin', cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (id !== state.requestId || !response.ok || !payload?.embed) return;
      state.embed = payload.embed;
      render();
    } catch (_) {
      // The editor displays the request error itself.
    }
  }

  function styles() {
    if (document.getElementById('dh-preview-styles')) return;
    const style = document.createElement('style');
    style.id = 'dh-preview-styles';
    style.textContent = `
      .gta-dee-preview{background:#1e1f22!important;border-color:#303236!important}
      .gta-discord{background:#313338!important;padding:16px!important;min-height:430px!important;border-radius:8px!important}
      .dh-message{display:flex;gap:10px;align-items:flex-start;color:#dbdee1;font-family:Arial,Helvetica,sans-serif}
      .dh-avatar{width:40px;height:40px;flex:0 0 40px;border-radius:50%;display:grid;place-items:center;background:#5865f2;color:#fff;font-size:12px;font-weight:800}
      .dh-message-main{min-width:0;flex:1}
      .dh-message-meta{display:flex;align-items:baseline;gap:7px;height:20px}
      .dh-username{font-size:14px;font-weight:700;color:#f2f3f5}
      .dh-bot{font-size:9px;line-height:15px;padding:0 4px;border-radius:3px;background:#5865f2;color:#fff;font-weight:800}
      .dh-time{font-size:10px;color:#949ba4}
      .dh-embed{position:relative;max-width:520px;margin-top:4px;padding:9px 12px 10px 12px;border-left:4px solid var(--dh-accent);background:#2b2d31;border-radius:4px;overflow:hidden;box-sizing:border-box}
      .dh-author{font-size:10px;font-weight:700;color:#b5bac1;margin:1px 0 5px}
      .dh-title{font-size:16px;line-height:21px;font-weight:700;color:#00a8fc;margin-bottom:5px;word-break:break-word}
      .dh-description{font-size:13px;line-height:18px;color:#dbdee1;word-break:break-word}
      .dh-line{min-height:18px}.dh-gap{height:5px}
      .dh-heading{font-weight:700;margin:3px 0}.dh-quote{border-left:3px solid #4e5058;padding-left:8px;color:#b5bac1;margin:3px 0}
      .dh-list{margin:2px 0 4px;padding-left:20px}.dh-list li{margin:1px 0}
      .dh-code{background:#1e1f22;border:1px solid #3f4147;border-radius:3px;padding:0 4px;font-family:Consolas,monospace;font-size:12px}
      .dh-codeblock{background:#1e1f22;border-radius:4px;padding:8px;overflow:auto;white-space:pre-wrap;font-family:Consolas,monospace;font-size:12px;margin:4px 0}
      .dh-spoiler{background:#202225;color:transparent;border-radius:2px;padding:0 2px}.dh-spoiler:hover{color:#dbdee1}
      .dh-fields{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:7px 10px;margin-top:8px}
      .dh-field{grid-column:span 12;min-width:0}.dh-field.dh-inline{grid-column:span 4}
      .dh-field-name{font-size:12px;line-height:16px;font-weight:700;color:#f2f3f5;word-break:break-word}
      .dh-field-value{font-size:12px;line-height:17px;color:#dbdee1;word-break:break-word}
      .dh-image{display:block;max-width:100%;max-height:300px;object-fit:contain;border-radius:4px;margin-top:9px}
      .dh-thumb{float:right;width:80px;height:80px;object-fit:cover;border-radius:4px;margin:0 0 8px 9px}
      .dh-footer{clear:both;font-size:10px;line-height:14px;color:#949ba4;margin-top:8px}
      .dh-description a,.dh-field-value a{color:#00a8fc;text-decoration:none}.dh-description a:hover,.dh-field-value a:hover{text-decoration:underline}
      @media(max-width:620px){.dh-field.dh-inline{grid-column:span 12}}
    `;
    document.head.appendChild(style);
  }

  function bind() {
    if (window.__dhPreviewBound) return;
    window.__dhPreviewBound = true;
    styles();

    document.getElementById('dee-load-button')?.addEventListener('click', () => {
      window.setTimeout(loadLinked, 50);
    });
    document.getElementById('dee-preview-button')?.addEventListener('click', render);

    const root = document.getElementById('view-donation-embed-editor');
    if (root) {
      root.addEventListener('input', () => window.requestAnimationFrame(render), true);
    }

    const observer = new MutationObserver(() => {
      const box = document.getElementById('dee-preview');
      if (box && !box.querySelector('.dh-message')) render();
    });
    const box = document.getElementById('dee-preview');
    if (box) observer.observe(box, { childList: true, subtree: true });
    render();
  }

  function init() {
    const timer = window.setInterval(() => {
      if (document.getElementById('view-donation-embed-editor') && document.getElementById('dee-preview')) {
        window.clearInterval(timer);
        bind();
      }
    }, 120);
    window.setTimeout(() => window.clearInterval(timer), 20000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
