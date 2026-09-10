(() => {
  'use strict';

  const state = {
    linkedMessageUrl: '',
    preserve: {},
    channelsLoaded: false,
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

  function styles() {
    if (document.getElementById('gta-donation-editor-styles')) return;
    const style = document.createElement('style');
    style.id = 'gta-donation-editor-styles';
    style.textContent = `
      #view-donation-embed-editor{max-width:1400px}
      .gta-dee-grid{display:grid;grid-template-columns:minmax(0,1.08fr) minmax(360px,.92fr);gap:16px}
      .gta-dee-card{background:var(--bg-card);border:1px solid var(--border);border-radius:11px;padding:18px}
      .gta-dee-form{display:grid;grid-template-columns:1fr 1fr;gap:12px}
      .gta-dee-field{display:flex;flex-direction:column;gap:6px}
      .gta-dee-field.full{grid-column:1/-1}
      .gta-dee-field label{font-size:10px;font-weight:700;color:var(--text-main)}
      .gta-dee-field input,.gta-dee-field textarea,.gta-dee-field select{width:100%;box-sizing:border-box;padding:10px 11px;border:1px solid var(--border);border-radius:7px;background:var(--bg-main);color:var(--text-main);font:inherit;font-size:11px;outline:none}
      .gta-dee-field textarea{min-height:170px;resize:vertical;line-height:1.5}
      .gta-dee-link{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:end;margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid var(--border)}
      .gta-dee-link button{height:36px;min-width:110px}
      .gta-dee-toolbar{display:flex;gap:4px;padding:5px;border:1px solid var(--border);border-bottom:0;border-radius:7px 7px 0 0;background:var(--bg-card)}
      .gta-dee-toolbar button{width:28px;height:27px;border:0;border-radius:5px;background:transparent;color:var(--text-main);cursor:pointer;font-size:12px;font-weight:700}
      .gta-dee-actions{display:flex;gap:8px;margin-top:14px;padding-top:14px;border-top:1px solid var(--border);flex-wrap:wrap}
      .gta-dee-actions .btn{min-width:140px}
      .gta-dee-status{min-height:17px;margin-top:8px;font-size:10px;color:var(--text-sec)}
      .gta-dee-status.success{color:var(--success)} .gta-dee-status.error{color:var(--danger)}
      .gta-dee-linked{margin-top:5px;font-size:9px;color:var(--success);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .gta-dee-preview{position:sticky;top:14px}
      .gta-discord{background:#313338;border-radius:9px;padding:15px;min-height:360px}
      .gta-user{display:flex;align-items:center;gap:9px;margin-bottom:12px}.gta-avatar{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:#5865f2;color:#fff;font-size:10px;font-weight:800}.gta-user strong{font-size:11px}.gta-user span{display:block;margin-top:2px;color:#949ba4;font-size:9px}
      .gta-embed{max-width:560px;background:#2b2d31;border-left:4px solid #5865f2;border-radius:4px;padding:12px;color:#dbdee1;min-height:90px;box-sizing:border-box}
      .gta-embed h3{font-size:16px;margin:0 0 6px}.gta-embed p{font-size:11px;white-space:pre-wrap;line-height:1.55;margin:0}.gta-embed img{max-width:100%;border-radius:4px;margin-top:9px;display:block}.gta-embed .thumb{float:right;width:76px;height:76px;object-fit:cover;margin:0 0 7px 9px}.gta-embed small{display:block;margin-top:10px;color:#949ba4}
      @media(max-width:920px){.gta-dee-grid{grid-template-columns:1fr}.gta-dee-preview{position:static}}
      @media(max-width:620px){.gta-dee-form{grid-template-columns:1fr}.gta-dee-field.full{grid-column:auto}.gta-dee-link{grid-template-columns:1fr}.gta-dee-link button{width:100%}.gta-dee-actions{flex-direction:column}.gta-dee-actions .btn{width:100%}}
    `;
    document.head.appendChild(style);
  }

  function getData() {
    return {
      title: document.getElementById('dee-title')?.value || '',
      description: document.getElementById('dee-description')?.value || '',
      color: document.getElementById('dee-color')?.value || '#2563EB',
      image: document.getElementById('dee-image')?.value || '',
      thumbnail: document.getElementById('dee-thumbnail')?.value || '',
      author: document.getElementById('dee-author')?.value || '',
      footer: document.getElementById('dee-footer')?.value || '',
    };
  }

  function setStatus(text, type = '') {
    const el = document.getElementById('dee-status');
    if (!el) return;
    el.textContent = text || '';
    el.className = `gta-dee-status ${type}`.trim();
  }

  function preview() {
    const box = document.getElementById('dee-preview');
    if (!box) return;
    const data = getData();
    const color = /^#[0-9a-f]{6}$/i.test(data.color) ? data.color : '#5865F2';
    const image = safeUrl(data.image);
    const thumb = safeUrl(data.thumbnail);
    const description = esc(data.description).replace(/\n/g, '<br>');
    box.innerHTML = `
      <div class="gta-user"><div class="gta-avatar">GP</div><div><strong>GTA Pinas Treasury</strong><span>Today</span></div></div>
      <div class="gta-embed" style="border-left-color:${esc(color)}">
        ${thumb ? `<img class="thumb" src="${esc(thumb)}" alt="">` : ''}
        ${data.author ? `<div style="font-size:10px;font-weight:700;margin-bottom:7px">${esc(data.author)}</div>` : ''}
        ${data.title ? `<h3>${esc(data.title)}</h3>` : ''}
        <p>${description || '<span style="color:#949ba4">Start typing to preview the embed.</span>'}</p>
        ${image ? `<img src="${esc(image)}" alt="">` : ''}
        ${data.footer ? `<small>${esc(data.footer)}</small>` : ''}
      </div>`;
  }

  async function loadChannels() {
    if (state.channelsLoaded) return;
    const select = document.getElementById('dee-channel');
    if (!select) return;
    try {
      const response = await fetch('/api/donation/channels', { credentials: 'same-origin', cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || payload.error || 'Failed to load donation channels.');
      const channels = Array.isArray(payload.channels) ? payload.channels : [];
      select.innerHTML = channels.length
        ? channels.map((c) => `<option value="${esc(c.id)}">#${esc(c.name || c.id)}</option>`).join('')
        : '<option value="">No donation channels configured</option>';
      state.channelsLoaded = true;
    } catch (error) {
      select.innerHTML = '<option value="">Unable to load channels</option>';
      setStatus(error.message, 'error');
    }
  }

  function buildView() {
    let view = document.getElementById('view-donation-embed-editor');
    if (view) return view;
    const main = document.querySelector('.content-area');
    if (!main) return null;
    view = document.createElement('section');
    view.id = 'view-donation-embed-editor';
    view.className = 'view-section';
    view.innerHTML = `
      <div class="page-header"><div><div class="page-kicker">Donation tools</div><h1>Embed Editor</h1><p>Create, send, load, and update Discord donation embeds.</p></div></div>
      <div class="gta-dee-grid">
        <section class="gta-dee-card">
          <div class="gta-dee-link">
            <div class="gta-dee-field"><label for="dee-message-url">Link existing Discord embed</label><input id="dee-message-url" maxlength="300" placeholder="Paste Discord message link..."><div id="dee-linked" class="gta-dee-linked"></div></div>
            <button id="dee-load-button" class="btn btn-outline" type="button">Load Embed</button>
          </div>
          <div class="gta-dee-form">
            <div class="gta-dee-field"><label for="dee-title">Title</label><input id="dee-title" maxlength="256" placeholder="Donation Price List"></div>
            <div class="gta-dee-field"><label for="dee-color">Accent color</label><input id="dee-color" maxlength="7" value="#2563EB"></div>
            <div class="gta-dee-field full"><label for="dee-description">Description</label><div class="gta-dee-toolbar"><button type="button" data-fmt="bold">B</button><button type="button" data-fmt="italic"><i>I</i></button><button type="button" data-fmt="underline"><u>U</u></button><button type="button" data-fmt="strike"><s>S</s></button><button type="button" data-fmt="code">&lt;&gt;</button><button type="button" data-fmt="spoiler">⊙</button><button type="button" data-fmt="quote">❝</button></div><textarea id="dee-description" maxlength="4000" placeholder="Write your donation information here..."></textarea></div>
            <div class="gta-dee-field"><label for="dee-image">Large image URL</label><input id="dee-image" maxlength="2048" placeholder="https://..."></div>
            <div class="gta-dee-field"><label for="dee-thumbnail">Thumbnail URL</label><input id="dee-thumbnail" maxlength="2048" placeholder="https://..."></div>
            <div class="gta-dee-field"><label for="dee-author">Author</label><input id="dee-author" maxlength="256" placeholder="GTA Pinas Treasury"></div>
            <div class="gta-dee-field"><label for="dee-footer">Footer</label><input id="dee-footer" maxlength="2048" placeholder="GTA Pinas Treasury"></div>
          </div>
          <div class="gta-dee-actions"><button class="btn btn-outline" id="dee-reset" type="button">Reset</button><button class="btn btn-success" id="dee-send-button" type="button">Send to Discord</button><button class="btn btn-primary" id="dee-update-button" type="button" style="display:none">Update Existing</button></div>
          <div class="gta-dee-field" style="margin-top:12px"><label for="dee-channel">Donation channel</label><select id="dee-channel"><option value="">Loading channels...</option></select></div>
          <div id="dee-status" class="gta-dee-status"></div>
        </section>
        <section class="gta-dee-card gta-dee-preview"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><strong>Discord Preview</strong><button id="dee-preview-button" class="btn btn-outline" type="button">Refresh Preview</button></div><div id="dee-preview" class="gta-discord"></div></section>
      </div>`;
    main.appendChild(view);

    document.getElementById('dee-load-button')?.addEventListener('click', loadExisting);
    document.getElementById('dee-send-button')?.addEventListener('click', send);
    document.getElementById('dee-update-button')?.addEventListener('click', updateExisting);
    document.getElementById('dee-reset')?.addEventListener('click', reset);
    document.getElementById('dee-preview-button')?.addEventListener('click', preview);
    document.querySelectorAll('#view-donation-embed-editor input,#view-donation-embed-editor textarea').forEach((el) => el.addEventListener('input', preview));
    document.querySelectorAll('#view-donation-embed-editor [data-fmt]').forEach((button) => button.addEventListener('click', () => formatText(button.dataset.fmt)));
    return view;
  }

  function activate() {
    styles();
    const view = buildView();
    if (!view) return;
    document.querySelectorAll('.view-section').forEach((section) => section.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach((item) => item.classList.remove('active'));
    view.classList.add('active');
    document.querySelector('[data-target="view-donation-embed-editor"]')?.classList.add('active');
    loadChannels();
    preview();
    if (window.renderPanelIcons) window.renderPanelIcons({ root: view });
  }

  function reset() {
    state.linkedMessageUrl = '';
    state.preserve = {};
    ['dee-message-url','dee-title','dee-description','dee-image','dee-thumbnail','dee-author','dee-footer'].forEach((id) => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    const color = document.getElementById('dee-color'); if (color) color.value = '#2563EB';
    const linked = document.getElementById('dee-linked'); if (linked) linked.textContent = '';
    const update = document.getElementById('dee-update-button'); if (update) update.style.display = 'none';
    setStatus(''); preview();
  }

  function fill(payload) {
    const embed = payload?.embed || {};
    const fields = Array.isArray(embed.fields) ? embed.fields : [];
    const description = embed.description || '';
    const fieldText = fields.map((field) => `**${field.name || ''}**\n${field.value || ''}`).join('\n\n');
    const fullDescription = fieldText ? `${description}${description ? '\n\n' : ''}${fieldText}` : description;
    const values = {
      'dee-title': embed.title || '', 'dee-description': fullDescription, 'dee-color': embed.color || '#2563EB',
      'dee-image': embed.image?.url || '', 'dee-thumbnail': embed.thumbnail?.url || '', 'dee-author': embed.author?.name || '', 'dee-footer': embed.footer?.text || '',
    };
    Object.entries(values).forEach(([id, value]) => { const el = document.getElementById(id); if (el) el.value = value; });
    state.preserve = { fields, url: embed.url || '', timestamp: embed.timestamp || '', author: embed.author || {}, footer: embed.footer || {}, image: embed.image || {}, thumbnail: embed.thumbnail || {} };
    preview();
  }

  async function loadExisting() {
    const input = document.getElementById('dee-message-url');
    const url = String(input?.value || '').trim();
    if (!url) return setStatus('Paste a Discord message link first.', 'error');
    setStatus('Loading embed...');
    try {
      const response = await fetch(`/api/donation/message?url=${encodeURIComponent(url)}`, { credentials: 'same-origin', cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || payload.error || 'Failed to load embed.');
      fill(payload);
      state.linkedMessageUrl = url;
      const linked = document.getElementById('dee-linked');
      if (linked) linked.textContent = payload.channel?.name ? `Linked: #${payload.channel.name}` : 'Existing message linked';
      const update = document.getElementById('dee-update-button'); if (update) update.style.display = '';
      setStatus('Embed loaded. You can edit and update it.', 'success');
    } catch (error) {
      setStatus(error.message, 'error');
    }
  }

  async function send() {
    const channelId = document.getElementById('dee-channel')?.value;
    if (!channelId) return setStatus('Select a donation channel first.', 'error');
    setStatus('Sending embed...');
    try {
      const response = await fetch('/api/donation/embed', { method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ channelId, embed:getData() }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || payload.error || 'Failed to send embed.');
      setStatus('Embed sent successfully.', 'success');
    } catch (error) { setStatus(error.message, 'error'); }
  }

  async function updateExisting() {
    if (!state.linkedMessageUrl) return setStatus('Load an existing Discord message first.', 'error');
    setStatus('Updating existing embed...');
    try {
      const response = await fetch('/api/donation/message', { method:'PATCH', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ messageUrl:state.linkedMessageUrl, embed:getData(), preserve:state.preserve }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || payload.error || 'Failed to update embed.');
      setStatus('Existing embed updated successfully.', 'success');
    } catch (error) { setStatus(error.message, 'error'); }
  }

  function formatText(kind) {
    const area = document.getElementById('dee-description');
    if (!area) return;
    const start = area.selectionStart || 0, end = area.selectionEnd || 0;
    const text = area.value.slice(start, end);
    if (!text) return;
    const wraps = { bold:['**','**'], italic:['*','*'], underline:['__','__'], strike:['~~','~~'], code:['`','`'], spoiler:['||','||'], quote:['> ',''] };
    const pair = wraps[kind]; if (!pair) return;
    area.setRangeText(`${pair[0]}${text}${pair[1]}`, start, end, 'select');
    area.dispatchEvent(new Event('input', { bubbles:true }));
  }

  function ensureNav() {
    const nav = document.querySelector('.nav-links');
    if (!nav) return;
    let item = nav.querySelector('[data-target="view-donation-embed-editor"]');
    if (!item) {
      item = document.createElement('a');
      item.className = 'nav-item';
      item.dataset.target = 'view-donation-embed-editor';
      item.href = '#';
      item.title = 'Embed Editor';
      item.innerHTML = '<i data-lucide="square-pen" size="18"></i><span class="nav-label">Embed Editor</span>';
      nav.appendChild(item);
    }
    if (item.dataset.gtaEmbedBound === 'true') return;
    item.dataset.gtaEmbedBound = 'true';
    item.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      activate();
    }, true);
    if (window.renderPanelIcons) window.renderPanelIcons({ root: item });
  }

  window.openDonationEmbedEditor = activate;

  function init() {
    styles();
    ensureNav();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();