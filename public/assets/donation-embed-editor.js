(() => {
    'use strict';

    const state = { channels: [], initialized: false, shortcutBound: false, linkedMessageUrl: '', preserve: {} };

    const esc = (value) => String(value ?? '')
        .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

    const safeUrl = (value) => {
        try { const url = new URL(String(value || '').trim()); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; }
        catch (_) { return ''; }
    };

    function injectStyles() {
        if (document.getElementById('donation-embed-editor-styles')) return;
        const style = document.createElement('style');
        style.id = 'donation-embed-editor-styles';
        style.textContent = `
            #view-donation-embed-editor .dee-shell{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(360px,.95fr);gap:20px;max-width:1200px}
            #view-donation-embed-editor .dee-card{background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:20px}
            #view-donation-embed-editor .dee-link-box{display:grid;grid-template-columns:minmax(0,1fr) 112px;gap:8px;align-items:end;margin-bottom:18px;padding-bottom:18px;border-bottom:1px solid var(--border)}
            #view-donation-embed-editor .dee-link-box .dee-field{min-width:0}
            #view-donation-embed-editor .dee-link-box .btn{width:112px;min-width:112px;height:36px;min-height:36px;padding:0 12px;justify-content:center;align-items:center;white-space:nowrap}
            #view-donation-embed-editor .dee-linked{font-size:9px;color:var(--success);margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
            #view-donation-embed-editor .dee-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
            #view-donation-embed-editor .dee-field{display:flex;flex-direction:column;gap:6px}
            #view-donation-embed-editor .dee-field.full{grid-column:1/-1}
            #view-donation-embed-editor .dee-field label{font-size:10px;font-weight:700;color:var(--text-main)}
            #view-donation-embed-editor .dee-field input,#view-donation-embed-editor .dee-field textarea,#view-donation-embed-editor .dee-field select{width:100%;box-sizing:border-box;border:1px solid var(--border);border-radius:6px;background:var(--bg-main);color:var(--text-main);outline:none;padding:10px 11px;font:inherit;font-size:11px}
            #view-donation-embed-editor .dee-field textarea{min-height:155px;resize:vertical;line-height:1.55}
            #view-donation-embed-editor .dee-field input:focus,#view-donation-embed-editor .dee-field textarea:focus,#view-donation-embed-editor .dee-field select:focus{border-color:var(--primary);box-shadow:0 0 0 2px color-mix(in srgb,var(--primary) 10%,transparent)}
            #view-donation-embed-editor .dee-toolbar{display:flex;align-items:center;gap:3px;margin-top:0;padding:4px 5px;border:1px solid var(--border);border-bottom:0;border-radius:6px 6px 0 0;background:var(--bg-card)}
            #view-donation-embed-editor .dee-toolbar button{width:27px;height:26px;border:0;border-radius:4px;background:transparent;color:var(--text-main);font:inherit;font-weight:700;font-size:12px;cursor:pointer;display:grid;place-items:center}
            #view-donation-embed-editor .dee-toolbar button:hover{background:var(--bg-main)}
            #view-donation-embed-editor .dee-toolbar .toolbar-sep{width:1px;height:18px;background:var(--border);margin:0 2px}
            #view-donation-embed-editor #dee-description{border-top-left-radius:0;border-top-right-radius:0;margin-top:0}
            #view-donation-embed-editor .dee-actions{display:flex;align-items:center;gap:8px;margin-top:14px;padding-top:14px;border-top:1px solid var(--border)}
            #view-donation-embed-editor .dee-actions .btn{min-height:34px;width:auto;flex:0 0 150px;padding:7px 14px}
            #view-donation-embed-editor .dee-update{display:none}
            #view-donation-embed-editor .dee-update.visible{display:inline-flex}
            #view-donation-embed-editor .dee-preview-wrap{position:sticky;top:16px;height:max-content}
            #view-donation-embed-editor .dee-preview-label{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}.dee-preview-label strong{font-size:12px}
            #view-donation-embed-editor .dee-preview-trigger{border:0;background:transparent;color:var(--primary);font:inherit;font-size:10px;font-weight:700;padding:4px 0;cursor:pointer}
            #view-donation-embed-editor .dee-discord{background:#313338;border-radius:6px;padding:14px;min-height:320px}
            #view-donation-embed-editor .dee-discord-user{display:flex;align-items:center;gap:9px;margin-bottom:12px}.dee-discord-avatar{width:32px;height:32px;border-radius:50%;background:#5865f2;display:grid;place-items:center;font-size:10px;font-weight:800}.dee-discord-user strong{font-size:11px}.dee-discord-user span{display:block;color:#949ba4;font-size:9px;margin-top:2px}
            #view-donation-embed-editor .dee-embed{position:relative;width:100%;max-width:540px;box-sizing:border-box;background:#2b2d31;border-left:4px solid #5865f2;border-radius:3px;padding:10px 12px;color:#dbdee1;overflow:hidden}
            #view-donation-embed-editor .dee-embed-main{padding-right:0}.dee-embed.has-thumbnail .dee-embed-main{padding-right:92px}
            #view-donation-embed-editor .dee-embed-author{font-size:10px;font-weight:700;margin-bottom:7px}.dee-embed-title{font-size:16px;font-weight:700;margin-bottom:6px}.dee-embed-description{font-size:11px;line-height:1.5;white-space:pre-wrap;word-break:break-word}
            #view-donation-embed-editor .dee-embed-description .discord-heading{font-weight:800;color:#f2f3f5;font-size:15px;line-height:1.35;margin:14px 0 7px}.dee-embed-description .discord-heading:first-child{margin-top:0}
            #view-donation-embed-editor .dee-embed-description .discord-list{margin:0 0 8px;padding-left:18px}.dee-embed-description .discord-list li{padding-left:2px;margin:2px 0}
            #view-donation-embed-editor .dee-embed-description .discord-quote{border-left:3px solid #4e5058;padding:2px 0 2px 10px;color:#b5bac1;margin:4px 0}
            #view-donation-embed-editor .dee-embed-description .discord-code{display:inline-block;background:#1e1f22;border-radius:3px;padding:1px 4px;font-family:monospace;font-size:10px}
            #view-donation-embed-editor .dee-embed-description .discord-bold{font-weight:700}.dee-embed-description .discord-italic{font-style:italic}.dee-embed-description .discord-underline{text-decoration:underline}.dee-embed-description .discord-strike{text-decoration:line-through}
            #view-donation-embed-editor .dee-embed-description .discord-spoiler{background:#1e1f22;color:#1e1f22;border-radius:3px;padding:0 4px}.dee-embed-description .discord-spoiler:hover{color:#dbdee1}
            #view-donation-embed-editor .dee-embed-thumbnail{position:absolute;top:10px;right:12px;width:72px;height:72px;border-radius:4px;object-fit:cover}.dee-embed-image{display:block;width:100%;max-height:260px;border-radius:4px;margin-top:10px;object-fit:contain}
            #view-donation-embed-editor .dee-embed-footer{color:#949ba4;font-size:9px;margin-top:10px;padding-top:2px}
            #view-donation-embed-editor .dee-send-box{margin-top:14px;padding-top:14px;border-top:1px solid var(--border)}.dee-send-box label{display:block;font-size:10px;font-weight:700;color:var(--text-main);margin-bottom:6px}.dee-status{margin-top:10px;font-size:10px;color:var(--text-sec);min-height:16px}.dee-status.error{color:var(--danger)}.dee-status.success{color:var(--success)}
            #view-donation-embed-editor #dee-channel{height:36px}
            @media(max-width:900px){#view-donation-embed-editor .dee-shell{grid-template-columns:1fr}.dee-preview-wrap{position:static}}
            @media(max-width:620px){#view-donation-embed-editor .dee-grid{grid-template-columns:1fr}.dee-field.full{grid-column:auto}.dee-card{padding:15px!important}.dee-link-box{grid-template-columns:1fr}.dee-link-box .btn{width:100%;min-width:0}.dee-actions{flex-direction:column;align-items:stretch}.dee-actions .btn{flex:1;width:100%}}
        `;
        document.head.appendChild(style);
    }

    function buildSidebarItem() {
        const navLinks = document.querySelector('.nav-links');
        if (!navLinks || document.querySelector('[data-target="view-donation-embed-editor"]')) return;
        const supportGroup = navLinks.querySelector('[data-nav-group="support"]');
        const item = document.createElement('a'); item.className = 'nav-item'; item.dataset.target = 'view-donation-embed-editor'; item.title = 'Donation Embed Editor';
        item.innerHTML = '<i data-lucide="square-pen" size="18"></i><span class="nav-label">Embed Editor</span>';
        if (supportGroup) navLinks.insertBefore(item, supportGroup); else navLinks.appendChild(item); item.addEventListener('click', () => openEditor());
    }

    function buildView() {
        if (document.getElementById('view-donation-embed-editor')) return;
        const main = document.querySelector('.content-area'); if (!main) return;
        const section = document.createElement('section'); section.id = 'view-donation-embed-editor'; section.className = 'view-section';
        section.innerHTML = `
            <div class="page-header"><div><div class="page-kicker">Donation tools</div><h1>Embed Editor</h1></div></div>
            <div class="dee-shell">
                <section class="dee-card">
                    <div class="dee-link-box">
                        <div class="dee-field"><label for="dee-message-url">Link existing Discord embed</label><input id="dee-message-url" maxlength="300" placeholder="Paste Discord message link..."><div id="dee-linked" class="dee-linked"></div></div>
                        <button id="dee-load-button" class="btn btn-outline" type="button">Load Embed</button>
                    </div>
                    <div class="dee-grid">
                        <div class="dee-field"><label for="dee-title">Title</label><input id="dee-title" maxlength="256" placeholder="e.g. Donation Price List"></div>
                        <div class="dee-field"><label for="dee-color">Accent color</label><input id="dee-color" maxlength="7" value="#2563EB" placeholder="#2563EB"></div>
                        <div class="dee-field full"><label for="dee-description">Description</label><div class="dee-toolbar" role="toolbar" aria-label="Description formatting"><button type="button" data-format="bold">B</button><button type="button" data-format="italic"><i>I</i></button><button type="button" data-format="underline"><u>U</u></button><button type="button" data-format="strike"><s>S</s></button><span class="toolbar-sep"></span><button type="button" data-format="quote">❝</button><button type="button" data-format="code">&lt;&gt;</button><button type="button" data-format="spoiler">⊙</button><button type="button" data-format="link">↗</button></div><textarea id="dee-description" maxlength="4000" placeholder="Write your donation information here..."></textarea></div>
                        <div class="dee-field"><label for="dee-image">Large image URL</label><input id="dee-image" maxlength="2048" placeholder="https://..."></div>
                        <div class="dee-field"><label for="dee-thumbnail">Thumbnail URL</label><input id="dee-thumbnail" maxlength="2048" placeholder="https://..."></div>
                        <div class="dee-field"><label for="dee-author">Author</label><input id="dee-author" maxlength="256" placeholder="GTA Pinas Treasury"></div>
                        <div class="dee-field"><label for="dee-footer">Footer</label><input id="dee-footer" maxlength="2048" placeholder="GTA Pinas Treasury"></div>
                    </div>
                    <div class="dee-actions">
                        <button class="btn btn-outline" type="button" id="dee-reset"><i data-lucide="rotate-ccw" size="15"></i> Reset</button>
                        <button id="dee-send-button" class="btn btn-success" type="button"><i data-lucide="send" size="15"></i> Send to Discord</button>
                        <button id="dee-update-button" class="btn btn-primary dee-update" type="button">Update Existing</button>
                    </div>
                    <div class="dee-send-box"><label for="dee-channel">Donation channel</label><select id="dee-channel"><option value="">Loading channels...</option></select><div id="dee-status" class="dee-status"></div></div>
                </section>
                <section class="dee-card dee-preview-wrap"><div class="dee-preview-label"><strong>Discord preview</strong><button class="dee-preview-trigger" type="button" id="dee-preview-button">Preview</button></div><div id="dee-preview" class="dee-discord"></div></section>
            </div>`;
        main.appendChild(section);
        document.getElementById('dee-load-button')?.addEventListener('click', loadExisting);
        document.getElementById('dee-reset')?.addEventListener('click', reset);
        document.getElementById('dee-send-button')?.addEventListener('click', send);
        document.getElementById('dee-update-button')?.addEventListener('click', updateExisting);
        document.getElementById('dee-preview-button')?.addEventListener('click', renderPreview);
        bindToolbar(); bindLivePreview();
    }

    function formData() { return { title: document.getElementById('dee-title')?.value || '', description: document.getElementById('dee-description')?.value || '', color: document.getElementById('dee-color')?.value || '', image: document.getElementById('dee-image')?.value || '', thumbnail: document.getElementById('dee-thumbnail')?.value || '', author: document.getElementById('dee-author')?.value || '', footer: document.getElementById('dee-footer')?.value || '' }; }

    function formatInline(value) {
        let text = esc(value);
        text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
        text = text.replace(/\|\|([^|]+)\|\|/g, '<span class="discord-spoiler">$1</span>');
        text = text.replace(/~~([^~]+)~~/g, '<span class="discord-strike">$1</span>');
        text = text.replace(/`([^`]+)`/g, '<span class="discord-code">$1</span>');
        text = text.replace(/\*\*([^*]+)\*\*/g, '<span class="discord-bold">$1</span>');
        text = text.replace(/__([^_]+)__/g, '<span class="discord-underline">$1</span>');
        text = text.replace(/\*([^*]+)\*/g, '<span class="discord-italic">$1</span>');
        return text;
    }

    function formatDescription(value) {
        return String(value || '').split('\n').map((line) => {
            const trimmed = line.trim();
            if (/^#{1,3}\s+/.test(trimmed)) return `<div class="discord-heading">${formatInline(trimmed.replace(/^#{1,3}\s+/, ''))}</div>`;
            if (/^[-*]\s+/.test(trimmed)) return `<ul class="discord-list"><li>${formatInline(trimmed.replace(/^[-*]\s+/, ''))}</li></ul>`;
            if (/^>\s?/.test(trimmed)) return `<div class="discord-quote">${formatInline(trimmed.replace(/^>\s?/, ''))}</div>`;
            return formatInline(line);
        }).join('<br>');
    }

    function renderPreview() {
        const target = document.getElementById('dee-preview'); if (!target) return;
        const data = formData();
        const avatar = (data.author || '5A').slice(0, 2).toUpperCase();
        const author = esc(data.author || 'GTA Pinas Treasury');
        const footer = esc(data.footer || '');
        const title = esc(data.title || '');
        const description = formatDescription(data.description || 'Start typing to preview your message.');
        const color = /^#[0-9a-fA-F]{6}$/.test(data.color) ? data.color : '#5865f2';
        target.innerHTML = `
            <div class="dee-discord-user"><div class="dee-discord-avatar">${avatar}</div><div><strong>GTA Pinas Treasury</strong><span>Today at ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span></div></div>
            <div class="dee-embed ${data.thumbnail ? 'has-thumbnail' : ''}" style="border-left-color:${color}">
                ${data.thumbnail ? `<img class="dee-embed-thumbnail" src="${esc(safeUrl(data.thumbnail))}" alt="">` : ''}
                <div class="dee-embed-main">
                    ${author ? `<div class="dee-embed-author">${author}</div>` : ''}
                    ${title ? `<div class="dee-embed-title">${title}</div>` : ''}
                    <div class="dee-embed-description">${description}</div>
                    ${data.image ? `<img class="dee-embed-image" src="${esc(safeUrl(data.image))}" alt="">` : ''}
                    ${footer ? `<div class="dee-embed-footer">${footer}</div>` : ''}
                </div>
            </div>`;
    }

    function bindLivePreview() {
        ['dee-title','dee-color','dee-description','dee-image','dee-thumbnail','dee-author','dee-footer'].forEach((id) => document.getElementById(id)?.addEventListener('input', renderPreview));
        renderPreview();
    }

    function bindToolbar() {
        const area = document.getElementById('dee-description');
        document.querySelectorAll('#view-donation-embed-editor [data-format]').forEach((button) => button.addEventListener('click', () => applyFormat(button.dataset.format)));
        if (!state.shortcutBound) {
            state.shortcutBound = true;
            document.addEventListener('keydown', (event) => {
                if (!document.getElementById('view-donation-embed-editor')?.classList.contains('active') || document.activeElement !== area) return;
                if (!event.ctrlKey && !event.metaKey) return;
                const map = { b: 'bold', i: 'italic', u: 'underline', s: 'strike', e: 'code' };
                if (map[event.key.toLowerCase()]) { event.preventDefault(); applyFormat(map[event.key.toLowerCase()]); }
            });
        }
    }

    function applyFormat(format) {
        const area = document.getElementById('dee-description'); if (!area) return;
        const start = area.selectionStart, end = area.selectionEnd, selected = area.value.slice(start, end);
        const pairs = { bold:['**','**'], italic:['*','*'], underline:['__','__'], strike:['~~','~~'], code:['`','`'], spoiler:['||','||'], quote:['> ',''], link:['[','](https://)'] };
        const pair = pairs[format]; if (!pair) return;
        const replacement = `${pair[0]}${selected || (format === 'link' ? 'link text' : 'text')}${pair[1]}`;
        area.setRangeText(replacement, start, end, 'select'); area.dispatchEvent(new Event('input', { bubbles:true })); area.focus();
    }

    async function getJson(url, options = {}) {
        const response = await fetch(url, { credentials:'same-origin', ...options, headers:{ 'Content-Type':'application/json', ...(options.headers || {}) } });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || body.message || `Request failed (${response.status})`);
        return body;
    }

    function setStatus(message, type = '') {
        const status = document.getElementById('dee-status');
        if (status) { status.textContent = message || ''; status.className = `dee-status ${type}`.trim(); }
    }

    async function loadChannels() {
        try {
            const data = await getJson('/api/donation/channels');
            const select = document.getElementById('dee-channel');
            if (!select) return;
            const channels = Array.isArray(data.channels) ? data.channels : [];
            state.channels = channels;
            select.innerHTML = channels.length ? channels.map((channel) => `<option value="${esc(channel.id)}">${esc(channel.name || channel.id)}</option>`).join('') : '<option value="">No donation channels configured</option>';
        } catch (error) { setStatus(error.message, 'error'); }
    }

    function fillEmbed(embed) {
        document.getElementById('dee-title').value = embed.title || '';
        document.getElementById('dee-description').value = embed.description || '';
        document.getElementById('dee-color').value = embed.colorHex || '#2563EB';
        document.getElementById('dee-image').value = embed.image?.url || '';
        document.getElementById('dee-thumbnail').value = embed.thumbnail?.url || '';
        document.getElementById('dee-author').value = embed.author?.name || '';
        document.getElementById('dee-footer').value = embed.footer?.text || '';
        renderPreview();
    }

    async function loadExisting() {
        const input = document.getElementById('dee-message-url');
        const button = document.getElementById('dee-load-button');
        const linked = document.getElementById('dee-linked');
        const updateButton = document.getElementById('dee-update-button');
        const url = String(input?.value || '').trim();
        if (!url) return setStatus('Paste a Discord message link first.', 'error');
        try {
            button.disabled = true; button.textContent = 'Loading...'; setStatus('');
            const data = await getJson(`/api/donation/message?url=${encodeURIComponent(url)}`);
            fillEmbed(data.embed || {});
            state.linkedMessageUrl = data.message?.url || url;
            state.preserve = { fields: data.embed?.fields || [], url: data.embed?.url || null, timestamp: data.embed?.timestamp || null };
            linked.textContent = data.message ? `Linked: ${data.message.channelName || data.message.channelId} • ${data.message.id}` : `Linked: ${url}`;
            updateButton.classList.add('visible');
            const select = document.getElementById('dee-channel');
            if (data.message?.channelId && state.channels.some((channel) => String(channel.id) === String(data.message.channelId))) select.value = data.message.channelId;
            setStatus('Existing embed loaded. You can edit and update it.', 'success');
        } catch (error) { setStatus(error.message, 'error'); }
        finally { button.disabled = false; button.textContent = 'Load Embed'; }
    }

    async function send() {
        const channelId = document.getElementById('dee-channel')?.value;
        if (!channelId) return setStatus('Select a donation channel first.', 'error');
        try { setStatus('Sending...'); await getJson('/api/donation/embed', { method:'POST', body:JSON.stringify({ channelId, embed:formData() }) }); setStatus('Embed sent successfully.', 'success'); }
        catch (error) { setStatus(error.message, 'error'); }
    }

    async function updateExisting() {
        if (!state.linkedMessageUrl) return setStatus('Load an existing Discord message first.', 'error');
        const button = document.getElementById('dee-update-button');
        try { button.disabled = true; setStatus('Updating...'); await getJson('/api/donation/message', { method:'PATCH', body:JSON.stringify({ messageUrl:state.linkedMessageUrl, embed:formData(), preserve:state.preserve }) }); setStatus('Existing embed updated successfully.', 'success'); }
        catch (error) { setStatus(error.message, 'error'); }
        finally { button.disabled = false; }
    }

    function reset() {
        ['dee-message-url','dee-title','dee-description','dee-image','dee-thumbnail'].forEach((id) => { const el = document.getElementById(id); if (el) el.value = ''; });
        document.getElementById('dee-color').value = '#2563EB';
        document.getElementById('dee-author').value = '';
        document.getElementById('dee-footer').value = '';
        document.getElementById('dee-linked').textContent = '';
        document.getElementById('dee-update-button').classList.remove('visible');
        state.linkedMessageUrl = ''; state.preserve = {};
        setStatus(''); renderPreview();
    }

    function openEditor() {
        buildView(); injectStyles(); buildSidebarItem();
        document.querySelectorAll('.view-section').forEach((section) => section.classList.remove('active'));
        document.getElementById('view-donation-embed-editor')?.classList.add('active');
        document.querySelectorAll('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.target === 'view-donation-embed-editor'));
        if (!state.initialized) { state.initialized = true; loadChannels(); }
        renderPreview();
        if (window.lucide?.createIcons) window.lucide.createIcons();
    }

    function boot() {
        injectStyles(); buildView(); buildSidebarItem();
        document.addEventListener('click', (event) => { const target = event.target.closest('[data-target="view-donation-embed-editor"]'); if (target) { event.preventDefault(); openEditor(); } });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
