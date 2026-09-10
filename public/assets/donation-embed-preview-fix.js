(() => {
  'use strict';

  const esc = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  function inlineMarkdown(value) {
    let text = esc(value);
    const protectedParts = [];
    const protect = (html) => {
      const token = `\u0001${protectedParts.length}\u0002`;
      protectedParts.push(html);
      return token;
    };
    text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, url) => protect(`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`));
    text = text.replace(/`([^`\n]+)`/g, (_, code) => protect(`<span class="gta-preview-code">${code}</span>`));
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
    const closeList = () => { if (listOpen) { output.push('</ul>'); listOpen = false; } };

    lines.forEach((raw) => {
      const trimmed = raw.trim();
      if (!trimmed) { closeList(); output.push('<div class="gta-preview-gap"></div>'); return; }
      if (/^[-*]\s+/.test(trimmed)) {
        if (!listOpen) { output.push('<ul class="gta-preview-list">'); listOpen = true; }
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

  function render() {
    const box = document.getElementById('dee-preview');
    if (!box) return false;
    const get = (id, fallback = '') => document.getElementById(id)?.value || fallback;
    const title = get('dee-title');
    const description = get('dee-description');
    const colorValue = get('dee-color', '#5865F2');
    const color = /^#[0-9a-f]{6}$/i.test(colorValue) ? colorValue : '#5865F2';
    const image = get('dee-image');
    const thumbnail = get('dee-thumbnail');
    const author = get('dee-author');
    const footer = get('dee-footer');
    const safeImage = (() => { try { const u = new URL(image); return ['http:','https:'].includes(u.protocol) ? u.href : ''; } catch (_) { return ''; } })();
    const safeThumb = (() => { try { const u = new URL(thumbnail); return ['http:','https:'].includes(u.protocol) ? u.href : ''; } catch (_) { return ''; } })();

    box.innerHTML = `
      <div class="gta-preview-message">
        <div class="gta-preview-avatar">GP</div>
        <div class="gta-preview-user"><strong>GTA Pinas Treasury</strong><span>Today at ${new Date().toLocaleTimeString([], { hour:'numeric', minute:'2-digit' })}</span></div>
      </div>
      <div class="gta-preview-embed" style="border-left-color:${esc(color)}">
        ${safeThumb ? `<img class="gta-preview-thumb" src="${esc(safeThumb)}" alt="">` : ''}
        ${author ? `<div class="gta-preview-author">${esc(author)}</div>` : ''}
        ${title ? `<div class="gta-preview-title">${esc(title)}</div>` : ''}
        <div class="gta-preview-description">${description ? renderMarkdown(description) : '<span class="gta-preview-muted">Start typing to preview the embed.</span>'}</div>
        ${safeImage ? `<img class="gta-preview-image" src="${esc(safeImage)}" alt="">` : ''}
        ${footer ? `<div class="gta-preview-footer">${esc(footer)}</div>` : ''}
      </div>`;
    return true;
  }

  function installStyles() {
    if (document.getElementById('gta-preview-fix-styles')) return;
    const style = document.createElement('style');
    style.id = 'gta-preview-fix-styles';
    style.textContent = `
      #view-donation-embed-editor .gta-discord{background:#313338!important;color:#dbdee1!important;font-family:"gg sans","Noto Sans",Arial,sans-serif!important}
      #view-donation-embed-editor .gta-preview-message{display:flex;align-items:flex-start;gap:10px;margin-bottom:10px}
      #view-donation-embed-editor .gta-preview-avatar{width:40px;height:40px;flex:0 0 40px;border-radius:50%;display:grid;place-items:center;background:#5865f2;color:#fff;font-size:11px;font-weight:700}
      #view-donation-embed-editor .gta-preview-user strong{display:block;color:#f2f3f5;font-size:12px;line-height:20px}
      #view-donation-embed-editor .gta-preview-user span{display:block;color:#949ba4;font-size:9px;line-height:16px}
      #view-donation-embed-editor .gta-preview-embed{position:relative;max-width:620px;background:#2b2d31;border-left:4px solid #5865f2;border-radius:3px;padding:10px 12px;box-sizing:border-box;overflow:hidden}
      #view-donation-embed-editor .gta-preview-author{font-size:10px;line-height:14px;font-weight:700;color:#f2f3f5;margin-bottom:5px}
      #view-donation-embed-editor .gta-preview-title{font-size:16px;line-height:20px;font-weight:700;color:#fff;margin-bottom:6px;word-break:break-word}
      #view-donation-embed-editor .gta-preview-description{font-size:11px;line-height:16px;color:#dbdee1;word-break:break-word}
      #view-donation-embed-editor .gta-preview-line{min-height:16px}
      #view-donation-embed-editor .gta-preview-heading{font-weight:700;color:#f2f3f5;min-height:16px}
      #view-donation-embed-editor .gta-preview-quote{border-left:3px solid #4e5058;padding-left:9px;color:#b5bac1;min-height:16px}
      #view-donation-embed-editor .gta-preview-list{margin:2px 0 2px 20px;padding:0}
      #view-donation-embed-editor .gta-preview-code{display:inline;padding:2px 4px;border-radius:4px;background:#1e1f22;border:1px solid #3f4147;color:#e3e5e8;font:11px/16px ui-monospace,SFMono-Regular,Consolas,monospace}
      #view-donation-embed-editor .gta-preview-spoiler{padding:0 4px;border-radius:3px;background:#202225;color:transparent}
      #view-donation-embed-editor .gta-preview-spoiler:hover{color:#dbdee1}
      #view-donation-embed-editor .gta-preview-description a{color:#00a8fc;text-decoration:underline}
      #view-donation-embed-editor .gta-preview-thumb{float:right;width:80px;height:80px;object-fit:cover;border-radius:4px;margin:0 0 8px 10px}
      #view-donation-embed-editor .gta-preview-image{display:block;max-width:100%;max-height:320px;width:auto;height:auto;object-fit:contain;border-radius:4px;margin-top:10px}
      #view-donation-embed-editor .gta-preview-footer{clear:both;margin-top:10px;color:#949ba4;font-size:9px}
      #view-donation-embed-editor .gta-preview-gap{height:6px}
      #view-donation-embed-editor .gta-preview-muted{color:#949ba4}
    `;
    document.head.appendChild(style);
  }

  function init() {
    installStyles();
    const run = () => render();
    ['dee-title','dee-description','dee-color','dee-image','dee-thumbnail','dee-author','dee-footer'].forEach((id) => {
      document.getElementById(id)?.addEventListener('input', run);
    });
    document.getElementById('dee-preview-button')?.addEventListener('click', run);
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();
