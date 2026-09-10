(() => {
    'use strict';

    const state = { channels: [], initialized: false };

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
        } catch (_) { return ''; }
    };

    // Small Discord-style markdown renderer for the local preview.
    // The actual message is still sent as the original text to Discord.
    function renderMarkdown(value) {
        let text = esc(value);
        const code = [];
        text = text.replace(/```([\s\S]*?)```/g, (_, body) => {
            const token = `__DEE_CODE_${code.length}__`;
            code.push(`<pre class="dee-codeblock"><code>${body.trim()}</code></pre>`);
            return token;
        });
        text = text.replace(/`([^`\n]+)`/g, '<code class="dee-inline-code">$1</code>');
        text = text.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
        text = text.replace(/__([^_\n]+)__/g, '<u>$1</u>');
        text = text.replace(/~~([^~\n]+)~~/g, '<s>$1</s>');
        text = text.replace(/(^|\n)\* ([^\n]*)/g, '$1<span class="dee-list">• $2</span>');
        text = text.replace(/(^|\n)- ([^\n]*)/g, '$1<span class="dee-list">• $2</span>');
        text = text.replace(/\n/g, '<br>');
        code.forEach((html, index) => { text = text.replace(`__DEE_CODE_${index}__`, html); });
        return text;
    }

    function injectStyles() {
        if (document.getElementById('donation-embed-editor-styles')) return;
        const style = document.createElement('style');
        style.id = 'donation-embed-editor-styles';
        style.textContent = `
            #view-donation-embed-editor .dee-shell{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(380px,.95fr);gap:20px;max-width:1200px}
            #view-donation-embed-editor .dee-card{background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:20px}
            #view-donation-embed-editor .dee-heading{display:flex;align-items:center;gap:12px;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid var(--border)}
            #view-donation-embed-editor .dee-icon{width:34px;height:34px;display:grid;place-items:center;border-radius:7px;background:var(--bg-main);border:1px solid var(--border);color:var(--text-main);flex:none}
            #view-donation-embed-editor .dee-heading h2{font-size:14px;margin:0 0 3px;font-weight:700}.dee-heading p{font-size:10px;color:var(--text-sec);margin:0}
            #view-donation-embed-editor .dee-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.dee-field{display:flex;flex-direction:column;gap:6px}.dee-field.full{grid-column:1/-1}.dee-field label{font-size:10px;font-weight:700;color:var(--text-main)}
            #view-donation-embed-editor .dee-help{font-size:9px;color:var(--text-sec);margin-top:1px;line-height:1.4}
            #view-donation-embed-editor .dee-field input,#view-donation-embed-editor .dee-field textarea,#view-donation-embed-editor .dee-field select{width:100%;box-sizing:border-box;border:1px solid var(--border);border-radius:6px;background:var(--bg-main);color:var(--text-main);outline:none;padding:10px 11px;font:inherit;font-size:11px;transition:border-color .15s,box-shadow .15s}
            #view-donation-embed-editor .dee-field textarea{min-height:155px;resize:vertical;line-height:1.55}.dee-field input:focus,.dee-field textarea:focus,.dee-field select:focus{border-color:var(--primary);box-shadow:0 0 0 2px color-mix(in srgb,var(--primary) 10%,transparent)}
            #view-donation-embed-editor .dee-actions{display:flex;gap:8px;margin-top:18px}.dee-actions .btn{flex:1}
            #view-donation-embed-editor .dee-preview-wrap{position:sticky;top:16px;height:max-content}
            #view-donation-embed-editor .dee-preview-label{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}.dee-preview-label strong{font-size:12px}.dee-preview-label span{font-size:9px;color:var(--text-sec)}

            /* Discord message surface */
            #view-donation-embed-editor .dee-discord{background:#313338;border-radius:6px;padding:18px 16px 24px;min-height:320px;color:#dbdee1;font-family:var(--font-family,Arial,sans-serif)}
            #view-donation-embed-editor .dee-discord-user{display:flex;align-items:center;gap:9px;margin:0 0 10px 0}
            #view-donation-embed-editor .dee-discord-avatar{width:40px;height:40px;border-radius:50%;background:#5865f2;display:grid;place-items:center;font-size:12px;font-weight:700;color:#fff;flex:none}
            #view-donation-embed-editor .dee-discord-meta{min-width:0;line-height:1.2}.dee-discord-meta strong{font-size:12px;color:#fff;font-weight:600}.dee-discord-meta span{display:inline-block;color:#949ba4;font-size:9px;margin-left:5px}
            #view-donation-embed-editor .dee-embed{position:relative;width:100%;max-width:100%;box-sizing:border-box;background:#2b2d31;border-left:4px solid #5865f2;border-radius:3px;padding:8px 12px 10px;color:#dbdee1;overflow:hidden}
            #view-donation-embed-editor .dee-embed.has-thumb{padding-right:108px;min-height:92px}
            #view-donation-embed-editor .dee-embed-author{font-size:10px;line-height:16px;font-weight:600;color:#dbdee1;margin:0 0 2px}
            #view-donation-embed-editor .dee-embed-title{font-size:13px;line-height:18px;font-weight:600;color:#fff;margin:0 0 4px}
            #view-donation-embed-editor .dee-embed-description{font-size:11px;line-height:1.45;color:#dbdee1;word-break:break-word}
            #view-donation-embed-editor .dee-inline-code{background:#1e1f22;border-radius:3px;padding:1px 3px;font-family:monospace;font-size:10px}
            #view-donation-embed-editor .dee-codeblock{display:block;background:#1e1f22;border:1px solid #1f2023;border-radius:4px;padding:7px 8px;margin:5px 0;white-space:pre-wrap;font:10px/1.4 monospace;color:#dbdee1;overflow:auto}
            #view-donation-embed-editor .dee-list{display:block;padding-left:3px}
            #view-donation-embed-editor .dee-thumb{position:absolute;right:10px;top:8px;width:80px;height:80px;object-fit:cover;border-radius:3px;margin:0}
            #view-donation-embed-editor .dee-image{display:block;width:100%;max-height:260px;object-fit:cover;border-radius:4px;margin-top:10px}
            #view-donation-embed-editor .dee-embed-footer{display:flex;align-items:center;gap:5px;color:#949ba4;font-size:9px;line-height:13px;margin-top:8px;min-height:13px}
            #view-donation-embed-editor .dee-footer-dot{opacity:.55}
            #view-donation-embed-editor .dee-send-box{margin-top:20px;padding-top:18px;border-top:1px solid var(--border)}.dee-send-box label{display:block;font-size:10px;font-weight:700;color:var(--text-main);margin-bottom:6px}.dee-status{margin-top:10px;font-size:10px;color:var(--text-sec);min-height:16px}.dee-status.error{color:var(--danger)}.dee-status.success{color:var(--success)}
            #view-donation-embed-editor .dee-note{margin-top:18px;padding:10px 12px;border:1px solid var(--border);border-radius:6px;background:var(--bg-main);font-size:9px;color:var(--text-sec);line-height:1.5}
            @media(max-width:900px){#view-donation-embed-editor .dee-shell{grid-template-columns:1fr}.dee-preview-wrap{position:static}}
            @media(max-width:620px){#view-donation-embed-editor .dee-grid{grid-template-columns:1fr}.dee-field.full{grid-column:auto}.dee-card{padding:15px!important}.dee-actions{flex-direction:column}.dee-embed.has-thumb{padding-right:12px}.dee-thumb{position:static!important;width:72px!important;height:72px!important;margin-top:8px!important}.dee-image{max-height:220px!important}}
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
        if (supportGroup) navLinks.insertBefore(item, supportGroup); else navLinks.appendChild(item);
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
                <div><div class="page-kicker">Donation tools</div><h1>Embed Editor</h1><p>Build a message, check how it looks, then send it to a donation channel.</p></div>
            </div>
            <div class="dee-shell">
                <section class="dee-card">
                    <div class="dee-heading"><div class="dee-icon"><i data-lucide="square-pen" size="17"></i></div><div><h2>Message details</h2><p>Fill in only the parts you want to show in the Discord message.</p></div></div>
                    <div class="dee-grid">
                        <div class="dee-field"><label for="dee-title">Title</label><input id="dee-title" maxlength="256" placeholder="e.g. Donation Price List"><span class="dee-help">Optional heading shown above the description.</span></div>
                        <div class="dee-field"><label for="dee-color">Accent color</label><input id="dee-color" maxlength="7" value="#2563EB" placeholder="#2563EB"><span class="dee-help">Use a 6-digit hex color.</span></div>
                        <div class="dee-field full"><label for="dee-description">Description</label><textarea id="dee-description" maxlength="4000" placeholder="Write your donation information here..."></textarea><span class="dee-help">This is the main content of the embed. Line breaks are kept.</span></div>
                        <div class="dee-field"><label for="dee-image">Large image URL</label><input id="dee-image" maxlength="2048" placeholder="https://..."><span class="dee-help">Shown across the bottom of the embed.</span></div>
                        <div class="dee-field"><label for="dee-thumbnail">Thumbnail URL</label><input id="dee-thumbnail" maxlength="2048" placeholder="https://..."><span class="dee-help">Shown in the top-right of the embed.</span></div>
                        <div class="dee-field"><label for="dee-author">Author</label><input id="dee-author" maxlength="256" placeholder="GTA Pinas Treasury"><span class="dee-help">Small text above the title.</span></div>
                        <div class="dee-field"><label for="dee-footer">Footer</label><input id="dee-footer" maxlength="2048" placeholder="GTA Pinas Treasury"><span class="dee-help">Small text at the bottom.</span></div>
                    </div>
                    <div class="dee-actions"><button class="btn btn-outline" type="button" onclick="window.donationEmbedEditor.reset()"><i data-lucide="rotate-ccw" size="15"></i> Reset</button><button class="btn btn-primary" type="button" onclick="window.donationEmbedEditor.preview()"><i data-lucide="eye" size="15"></i> Preview</button></div>
                    <div class="dee-send-box"><label for="dee-channel">Donation channel</label><select id="dee-channel"><option value="">Loading channels...</option></select><span class="dee-help">Only channels approved for donations are available here.</span><button id="dee-send-button" class="btn btn-success" style="width:100%;margin-top:11px" type="button" onclick="window.donationEmbedEditor.send()"><i data-lucide="send" size="15"></i> Send to Discord</button><div id="dee-status" class="dee-status"></div></div>
                    <div class="dee-note">Tip: keep the description short and easy to scan. Use separate lines for prices, requirements, or payment details.</div>
                </section>
                <section class="dee-card dee-preview-wrap">
                    <div class="dee-preview-label"><strong>Discord preview</strong><span>Matches Discord message layout</span></div>
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

        const hasThumb = Boolean(thumbnail);
        const author = data.author.trim();
        const title = data.title.trim();
        const description = data.description;
        const footer = data.footer.trim();
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        preview.innerHTML = `
            <div class="dee-discord-user">
                <div class="dee-discord-avatar">5A</div>
                <div class="dee-discord-meta"><strong>GTA Pinas Treasury</strong><span>Today at ${esc(time)}</span></div>
            </div>
            <div class="dee-embed${hasThumb ? ' has-thumb' : ''}" style="border-left-color:${esc(color)}">
                ${author ? `<div class="dee-embed-author">${esc(author)}</div>` : ''}
                ${title ? `<div class="dee-embed-title">${esc(title)}</div>` : ''}
                ${description ? `<div class="dee-embed-description">${renderMarkdown(description)}</div>` : '<div class="dee-embed-description" style="opacity:.5">Start typing to preview your message.</div>'}
                ${thumbnail ? `<img class="dee-thumb" src="${esc(thumbnail)}" alt="" onerror="this.style.display='none';this.closest('.dee-embed')?.classList.remove('has-thumb')">` : ''}
                ${image ? `<img class="dee-image" src="${esc(image)}" alt="" onerror="this.style.display='none'">` : ''}
                ${footer ? `<div class="dee-embed-footer"><span>${esc(footer)}</span><span class="dee-footer-dot">•</span><span>Today at ${esc(time)}</span></div>` : ''}
            </div>
        `;
    }

    function bindLivePreview() {
        ['dee-title','dee-description','dee-color','dee-image','dee-thumbnail','dee-author','dee-footer'].forEach(id => {
            const el = document.getElementById(id);
            if (el && !el.dataset.deeBound) {
                el.dataset.deeBound = '1';
                el.addEventListener('input', renderPreview);
                el.addEventListener('change', renderPreview);
            }
        });
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
                ? '<option value="">Select a channel...</option>' + state.channels.map(channel => `<option value="${esc(channel.id)}">#${esc(channel.name)}</option>`).join('')
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
        setStatus('Sending to Discord...');
        try {
            const response = await fetch('/api/donation/embed', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ channelId, embed }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.error || 'Unable to send embed.');
            setStatus(`Sent successfully to #${payload.channel?.name || 'donation channel'}.`, 'success');
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
        bindLivePreview();
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
        bindLivePreview();
        renderPreview();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();
