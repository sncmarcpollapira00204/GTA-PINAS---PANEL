(() => {
    'use strict';

    const state = {
        channels: [],
        initialized: false,
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

    function injectStyles() {
        if (document.getElementById('donation-embed-editor-styles')) return;
        const style = document.createElement('style');
        style.id = 'donation-embed-editor-styles';
        style.textContent = `
            #view-donation-embed-editor .dee-shell{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(340px,.9fr);gap:16px;max-width:1180px}
            #view-donation-embed-editor .dee-card{background:var(--bg-card);border:1px solid var(--border);border-radius:11px;padding:18px}
            #view-donation-embed-editor .dee-heading{display:flex;align-items:flex-start;gap:11px;margin-bottom:18px;padding-bottom:15px;border-bottom:1px solid var(--border)}
            #view-donation-embed-editor .dee-icon{width:36px;height:36px;display:grid;place-items:center;border-radius:8px;background:color-mix(in srgb,var(--primary) 10%,var(--bg-main));border:1px solid color-mix(in srgb,var(--primary) 24%,var(--border));color:var(--primary);flex:none}
            #view-donation-embed-editor .dee-heading h2{font-size:14px;margin-bottom:4px}.dee-heading p{font-size:10px;color:var(--text-sec)}
            #view-donation-embed-editor .dee-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.dee-field{display:flex;flex-direction:column;gap:7px}.dee-field.full{grid-column:1/-1}.dee-field label{font-size:9px;font-weight:800;color:var(--text-sec);letter-spacing:.08em;text-transform:uppercase}
            #view-donation-embed-editor .dee-field input,#view-donation-embed-editor .dee-field textarea,#view-donation-embed-editor .dee-field select{width:100%;border:1px solid var(--border);border-radius:8px;background:var(--bg-main);color:var(--text-main);outline:none;padding:10px 11px;font:inherit;font-size:11px}
            #view-donation-embed-editor .dee-field textarea{min-height:190px;resize:vertical;line-height:1.5}.dee-field input:focus,.dee-field textarea:focus,.dee-field select:focus{border-color:var(--primary);box-shadow:0 0 0 2px color-mix(in srgb,var(--primary) 15%,transparent)}
            #view-donation-embed-editor .dee-actions{display:flex;gap:9px;margin-top:14px}.dee-actions .btn{flex:1}.dee-preview-wrap{position:sticky;top:0}.dee-preview-label{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}.dee-preview-label strong{font-size:12px}.dee-preview-label span{font-size:9px;color:var(--text-sec)}
            #view-donation-embed-editor .dee-discord{background:#313338;border-radius:8px;padding:16px;min-height:280px}.dee-discord-user{display:flex;align-items:center;gap:9px;margin-bottom:13px}.dee-discord-avatar{width:34px;height:34px;border-radius:50%;background:#5865f2;display:grid;place-items:center;font-size:11px;font-weight:800}.dee-discord-user strong{font-size:11px}.dee-discord-user span{display:block;color:#949ba4;font-size:9px;margin-top:2px}.dee-embed{width:100%;max-width:540px;background:#2b2d31;border-left:4px solid #5865f2;border-radius:4px;padding:12px 14px;color:#dbdee1}.dee-embed-author{font-size:10px;font-weight:700;margin-bottom:7px}.dee-embed-title{font-size:14px;font-weight:700;margin-bottom:6px}.dee-embed-description{font-size:11px;line-height:1.5;white-space:pre-wrap;word-break:break-word}.dee-embed img{display:block;max-width:100%;max-height:260px;border-radius:4px;margin-top:10px;object-fit:contain}.dee-embed-footer{color:#949ba4;font-size:9px;margin-top:10px;padding-top:2px}.dee-send-box{margin-top:14px;padding-top:14px;border-top:1px solid var(--border)}.dee-send-box label{display:block;font-size:9px;font-weight:800;color:var(--text-sec);letter-spacing:.08em;text-transform:uppercase;margin-bottom:7px}.dee-status{margin-top:10px;font-size:10px;color:var(--text-sec);min-height:16px}.dee-status.error{color:var(--danger)}.dee-status.success{color:var(--success)}
            @media(max-width:900px){#view-donation-embed-editor .dee-shell{grid-template-columns:1fr}.dee-preview-wrap{position:static}}
            @media(max-width:620px){#view-donation-embed-editor .dee-grid{grid-template-columns:1fr}.dee-field.full{grid-column:auto}.dee-card{padding:14px!important}}
        `;
        document.head.appendChild(style);
    }

    function buildSidebarItem() {
        const navLinks = document.querySelector('.nav-links');
        if (!navLinks || document.querySelector('[data-target="view-donation-embed-editor"]')) return;
        const supportGroup = navLinks.querySelector('[data-nav-group="support"]');
        const item = document.createElement('a');
        item.className = 'nav-item';
        item.dataset.target = 'view-donation-embed-editor';
        item.title = 'Donation Embed Editor';
        item.innerHTML = '<i data-lucide="square-pen" size="18"></i><span class="nav-label">Embed Editor</span>';
        if (supportGroup) navLinks.insertBefore(item, supportGroup);
        else navLinks.appendChild(item);
        item.addEventListener('click', () => openEditor());
    }

    function buildView() {
        if (document.getElementById('view-donation-embed-editor')) return;
        const main = document.querySelector('.content-area');
        if (!main) return;
        const section = document.createElement('section');
        section.id = 'view-donation-embed-editor';
        section.className = 'view-section';
        section.innerHTML = `
            <div class="page-header">
                <div><div class="page-kicker">Donation tools</div><h1>Embed Editor</h1><p>Create a Discord embed and send it directly to an approved GTA Pinas donation channel.</p></div>
            </div>
            <div class="dee-shell">
                <section class="dee-card">
                    <div class="dee-heading"><div class="dee-icon"><i data-lucide="square-pen" size="18"></i></div><div><h2>Compose Embed</h2><p>Only donation channels configured on the panel can be selected.</p></div></div>
                    <div class="dee-grid">
                        <div class="dee-field"><label for="dee-title">Title</label><input id="dee-title" maxlength="256" placeholder="Donation title"></div>
                        <div class="dee-field"><label for="dee-color">Color</label><input id="dee-color" maxlength="7" value="#2563EB" placeholder="#2563EB"></div>
                        <div class="dee-field full"><label for="dee-description">Description</label><textarea id="dee-description" maxlength="4000" placeholder="Write the donation information here..."></textarea></div>
                        <div class="dee-field"><label for="dee-image">Image URL</label><input id="dee-image" maxlength="2048" placeholder="https://..."></div>
                        <div class="dee-field"><label for="dee-thumbnail">Thumbnail URL</label><input id="dee-thumbnail" maxlength="2048" placeholder="https://..."></div>
                        <div class="dee-field"><label for="dee-author">Author</label><input id="dee-author" maxlength="256" placeholder="GTA Pinas Treasury"></div>
                        <div class="dee-field"><label for="dee-footer">Footer</label><input id="dee-footer" maxlength="2048" placeholder="GTA Pinas Treasury"></div>
                    </div>
                    <div class="dee-actions"><button class="btn btn-outline" type="button" onclick="window.donationEmbedEditor.reset()"><i data-lucide="rotate-ccw" size="15"></i> Reset</button><button class="btn btn-primary" type="button" onclick="window.donationEmbedEditor.preview()"><i data-lucide="eye" size="15"></i> Update Preview</button></div>
                    <div class="dee-send-box"><label for="dee-channel">Send to donation channel</label><select id="dee-channel"><option value="">Loading donation channels...</option></select><button id="dee-send-button" class="btn btn-success" style="width:100%;margin-top:9px" type="button" onclick="window.donationEmbedEditor.send()"><i data-lucide="send" size="15"></i> Send Embed</button><div id="dee-status" class="dee-status"></div></div>
                </section>
                <section class="dee-card dee-preview-wrap">
                    <div class="dee-preview-label"><strong>Discord Preview</strong><span>Live local preview</span></div>
                    <div id="dee-preview" class="dee-discord"></div>
                </section>
            </div>
        `;
        main.appendChild(section);
    }

    function formData() {
        return {
            title: document.getElementById('dee-title')?.value || '',
            description: document.getElementById('dee-description')?.value || '',
            color: document.getElementById('dee-color')?.value || '',
            image: document.getElementById('dee-image')?.value || '',
            thumbnail: document.getElementById('dee-thumbnail')?.value || '',
            author: document.getElementById('dee-author')?.value || '',
            footer: document.getElementById('dee-footer')?.value || '',
        };
    }

    function renderPreview() {
        const data = formData();
        const colorRaw = String(data.color || '').trim().replace(/^#/, '');
        const color = /^[0-9a-fA-F]{6}$/.test(colorRaw) ? `#${colorRaw}` : '#5865F2';
        const image = safeUrl(data.image);
        const thumbnail = safeUrl(data.thumbnail);
        const preview = document.getElementById('dee-preview');
        if (!preview) return;
        preview.innerHTML = `
            <div class="dee-discord-user"><div class="dee-discord-avatar">5A</div><div><strong>GTA Pinas Treasury</strong><span>Today at ${new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span></div></div>
            <div class="dee-embed" style="border-left-color:${esc(color)}">
                ${data.author ? `<div class="dee-embed-author">${esc(data.author)}</div>` : ''}
                ${data.title ? `<div class="dee-embed-title">${esc(data.title)}</div>` : ''}
                ${data.description ? `<div class="dee-embed-description">${esc(data.description)}</div>` : '<div class="dee-embed-description" style="opacity:.5">Your description will appear here.</div>'}
                ${thumbnail ? `<img src="${esc(thumbnail)}" alt="Thumbnail preview" onerror="this.style.display='none'">` : ''}
                ${image ? `<img src="${esc(image)}" alt="Image preview" onerror="this.style.display='none'">` : ''}
                ${data.footer ? `<div class="dee-embed-footer">${esc(data.footer)}</div>` : ''}
            </div>
        `;
    }

    async function loadChannels() {
        const select = document.getElementById('dee-channel');
        if (!select) return;
        try {
            const response = await fetch('/api/donation/channels', { cache: 'no-store' });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.error || 'Unable to load donation channels.');
            state.channels = Array.isArray(payload.channels) ? payload.channels : [];
            select.innerHTML = state.channels.length
                ? '<option value="">Select a donation channel...</option>' + state.channels.map(channel => `<option value="${esc(channel.id)}">#${esc(channel.name)}</option>`).join('')
                : '<option value="">No donation channels configured</option>';
        } catch (error) {
            select.innerHTML = '<option value="">Unable to load donation channels</option>';
            setStatus(error.message, 'error');
        }
    }

    function setStatus(message, type = '') {
        const element = document.getElementById('dee-status');
        if (!element) return;
        element.textContent = message || '';
        element.className = `dee-status ${type}`.trim();
    }

    function reset() {
        ['dee-title','dee-description','dee-image','dee-thumbnail','dee-author','dee-footer'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
        const color = document.getElementById('dee-color'); if (color) color.value = '#2563EB';
        const select = document.getElementById('dee-channel'); if (select) select.value = '';
        setStatus('');
        renderPreview();
    }

    async function send() {
        const select = document.getElementById('dee-channel');
        const button = document.getElementById('dee-send-button');
        const channelId = select?.value || '';
        const embed = formData();
        if (!channelId) return setStatus('Select a donation channel first.', 'error');
        if (!embed.description.trim()) return setStatus('Description is required.', 'error');
        if (embed.color && !/^#?[0-9a-fA-F]{6}$/.test(embed.color.trim())) return setStatus('Color must be a 6-digit hexadecimal value.', 'error');
        if (embed.image && !safeUrl(embed.image)) return setStatus('Image URL must use HTTP or HTTPS.', 'error');
        if (embed.thumbnail && !safeUrl(embed.thumbnail)) return setStatus('Thumbnail URL must use HTTP or HTTPS.', 'error');

        button?.setAttribute('disabled', 'disabled');
        setStatus('Sending embed to Discord...');
        try {
            const response = await fetch('/api/donation/embed', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ channelId, embed }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.error || 'Unable to send embed.');
            setStatus(`Embed sent successfully to #${payload.channel?.name || 'donation channel'}.`, 'success');
        } catch (error) {
            setStatus(error.message || 'Unable to send embed.', 'error');
        } finally {
            button?.removeAttribute('disabled');
        }
    }

    function openEditor() {
        document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
        const navItem = document.querySelector('[data-target="view-donation-embed-editor"]');
        navItem?.classList.add('active');
        document.querySelectorAll('.view-section').forEach(section => section.classList.remove('active'));
        document.getElementById('view-donation-embed-editor')?.classList.add('active');
        document.body.classList.remove('transcript-workspace-active');
        if (window.renderPanelIcons) window.renderPanelIcons();
        renderPreview();
        loadChannels();
        if (typeof window.toggleMobileSidebar === 'function') window.toggleMobileSidebar(false);
    }

    window.donationEmbedEditor = { reset, preview: renderPreview, send, open: openEditor };

    function init() {
        if (state.initialized) return;
        state.initialized = true;
        injectStyles();
        buildSidebarItem();
        buildView();
        if (window.renderPanelIcons) window.renderPanelIcons();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();
