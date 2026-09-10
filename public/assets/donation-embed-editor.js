(() => {
    'use strict';

    const state = { channels: [], initialized: false, shortcutBound: false };

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

    function injectStyles() {
        if (document.getElementById('donation-embed-editor-styles')) return;
        const style = document.createElement('style');
        style.id = 'donation-embed-editor-styles';
        style.textContent = `
            #view-donation-embed-editor .dee-shell{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(360px,.95fr);gap:20px;max-width:1200px}
            #view-donation-embed-editor .dee-card{background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:20px}
            #view-donation-embed-editor .dee-heading{display:flex;align-items:center;gap:12px;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid var(--border)}
            #view-donation-embed-editor .dee-icon{width:34px;height:34px;display:grid;place-items:center;border-radius:7px;background:var(--bg-main);border:1px solid var(--border);color:var(--text-main);flex:none}
            #view-donation-embed-editor .dee-heading h2{font-size:14px;margin:0;font-weight:700}
            #view-donation-embed-editor .dee-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
            #view-donation-embed-editor .dee-field{display:flex;flex-direction:column;gap:6px}
            #view-donation-embed-editor .dee-field.full{grid-column:1/-1}
            #view-donation-embed-editor .dee-field label{font-size:10px;font-weight:700;color:var(--text-main);letter-spacing:0;text-transform:none}
            #view-donation-embed-editor .dee-field input,#view-donation-embed-editor .dee-field textarea,#view-donation-embed-editor .dee-field select{width:100%;box-sizing:border-box;border:1px solid var(--border);border-radius:6px;background:var(--bg-main);color:var(--text-main);outline:none;padding:10px 11px;font:inherit;font-size:11px;transition:border-color .15s,box-shadow .15s}
            #view-donation-embed-editor .dee-field textarea{min-height:155px;resize:vertical;line-height:1.55}
            #view-donation-embed-editor .dee-field input:focus,#view-donation-embed-editor .dee-field textarea:focus,#view-donation-embed-editor .dee-field select:focus{border-color:var(--primary);box-shadow:0 0 0 2px color-mix(in srgb,var(--primary) 10%,transparent)}
            #view-donation-embed-editor .dee-actions{display:flex;align-items:center;justify-content:flex-start;gap:8px;margin-top:14px;padding-top:14px;border-top:1px solid var(--border)}
            #view-donation-embed-editor .dee-actions .btn{min-height:34px;width:auto;flex:0 0 150px;padding:7px 14px}
            #view-donation-embed-editor .dee-preview-wrap{position:sticky;top:16px;height:max-content}
            #view-donation-embed-editor .dee-preview-label{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}.dee-preview-label strong{font-size:12px}
            #view-donation-embed-editor .dee-preview-trigger{border:0;background:transparent;color:var(--primary);font:inherit;font-size:10px;font-weight:700;padding:4px 0;cursor:pointer}
            #view-donation-embed-editor .dee-preview-trigger:hover{opacity:.82}
            #view-donation-embed-editor .dee-discord{background:#313338;border-radius:6px;padding:14px;min-height:320px}
            #view-donation-embed-editor .dee-discord-user{display:flex;align-items:center;gap:9px;margin-bottom:12px}.dee-discord-avatar{width:32px;height:32px;border-radius:50%;background:#5865f2;display:grid;place-items:center;font-size:10px;font-weight:800}.dee-discord-user strong{font-size:11px}.dee-discord-user span{display:block;color:#949ba4;font-size:9px;margin-top:2px}
            #view-donation-embed-editor .dee-embed{position:relative;width:100%;max-width:540px;box-sizing:border-box;background:#2b2d31;border-left:4px solid #5865f2;border-radius:3px;padding:10px 12px;color:#dbdee1;overflow:hidden}
            #view-donation-embed-editor .dee-embed-main{padding-right:0}.dee-embed.has-thumbnail .dee-embed-main{padding-right:92px}
            #view-donation-embed-editor .dee-embed-author{font-size:10px;font-weight:700;margin-bottom:7px}.dee-embed-title{font-size:16px;font-weight:700;margin-bottom:6px}.dee-embed-description{font-size:11px;line-height:1.5;white-space:pre-wrap;word-break:break-word}
            #view-donation-embed-editor .dee-embed-description .discord-heading{font-weight:800;color:#f2f3f5;font-size:15px;line-height:1.35;margin:14px 0 7px}
            #view-donation-embed-editor .dee-embed-description .discord-heading:first-child{margin-top:0}
            #view-donation-embed-editor .dee-embed-description .discord-list{margin:0 0 8px;padding-left:18px}.dee-embed-description .discord-list li{padding-left:2px;margin:2px 0}
            #view-donation-embed-editor .dee-embed-description .discord-quote{border-left:3px solid #4e5058;padding:2px 0 2px 10px;color:#b5bac1;margin:4px 0}
            #view-donation-embed-editor .dee-embed-description .discord-code{display:inline-block;background:#1e1f22;border-radius:3px;padding:1px 4px;font-family:monospace;font-size:10px}
            #view-donation-embed-editor .dee-embed-description .discord-bold{font-weight:700}
            #view-donation-embed-editor .dee-embed-description .discord-italic{font-style:italic}
            #view-donation-embed-editor .dee-embed-description .discord-underline{text-decoration:underline}
            #view-donation-embed-editor .dee-embed-description .discord-strike{text-decoration:line-through}
            #view-donation-embed-editor .dee-embed-description .discord-spoiler{background:#1e1f22;color:#1e1f22;border-radius:3px;padding:0 4px}
            #view-donation-embed-editor .dee-embed-description .discord-spoiler:hover{color:#dbdee1}
            #view-donation-embed-editor .dee-embed-thumbnail{position:absolute;top:10px;right:12px;width:72px;height:72px;border-radius:4px;object-fit:cover}.dee-embed-image{display:block;width:100%;max-height:260px;border-radius:4px;margin-top:10px;object-fit:contain}
            #view-donation-embed-editor .dee-embed-footer{color:#949ba4;font-size:9px;margin-top:10px;padding-top:2px}
            #view-donation-embed-editor .dee-send-box{margin-top:14px;padding-top:14px;border-top:1px solid var(--border)}.dee-send-box label{display:block;font-size:10px;font-weight:700;color:var(--text-main);margin-bottom:6px}.dee-status{margin-top:10px;font-size:10px;color:var(--text-sec);min-height:16px}.dee-status.error{color:var(--danger)}.dee-status.success{color:var(--success)}
            #view-donation-embed-editor #dee-channel{height:36px}
            #view-donation-embed-editor #dee-send-button{min-height:34px;width:auto!important;margin-top:0!important;padding:7px 14px}
            #view-donation-embed-editor .dee-toolbar{display:flex;align-items:center;gap:3px;margin-top:6px;padding:4px 5px;border:1px solid var(--border);border-bottom:0;border-radius:6px 6px 0 0;background:var(--bg-card)}
            #view-donation-embed-editor .dee-toolbar button{width:27px;height:26px;border:0;border-radius:4px;background:transparent;color:var(--text-main);font:inherit;font-weight:700;font-size:12px;cursor:pointer;display:grid;place-items:center}
            #view-donation-embed-editor .dee-toolbar button:hover{background:var(--bg-main)}
            #view-donation-embed-editor .dee-toolbar .toolbar-sep{width:1px;height:18px;background:var(--border);margin:0 2px}
            #view-donation-embed-editor #dee-description{border-top-left-radius:0;border-top-right-radius:0;margin-top:0}
            @media(max-width:900px){#view-donation-embed-editor .dee-shell{grid-template-columns:1fr}.dee-preview-wrap{position:static}}
            @media(max-width:620px){#view-donation-embed-editor .dee-grid{grid-template-columns:1fr}.dee-field.full{grid-column:auto}.dee-card{padding:15px!important}.dee-actions{flex-direction:column;align-items:stretch}.dee-actions .btn{flex:1;width:100%}}
        `;
        document.head.appendChild(style);
    }

    function buildSidebarItem() {
        const navLinks = document.querySelector('.nav-links');
        if (!navLinks || document.querySelector('[data-target="view-donation-embed-editor"]')) return;
        const supportGroup = navLinks.querySelector('[data-nav-group="support"]');
        const item = document.createElement('a');
        item.className = 'nav-item'; item.dataset.target = 'view-donation-embed-editor'; item.title = 'Donation Embed Editor';
        item.innerHTML = '<i data-lucide="square-pen" size="18"></i><span class="nav-label">Embed Editor</span>';
        if (supportGroup) navLinks.insertBefore(item, supportGroup); else navLinks.appendChild(item);
        item.addEventListener('click', () => openEditor());
    }

    function buildView() {
        if (document.getElementById('view-donation-embed-editor')) return;
        const main = document.querySelector('.content-area'); if (!main) return;
        const section = document.createElement('section'); section.id = 'view-donation-embed-editor'; section.className = 'view-section';
        section.innerHTML = `
            <div class="page-header"><div><div class="page-kicker">Donation tools</div><h1>Embed Editor</h1></div></div>
            <div class="dee-shell">
                <section class="dee-card">
                    <div class="dee-heading"><div class="dee-icon"><i data-lucide="square-pen" size="17"></i></div><div><h2>Message details</h2></div></div>
                    <div class="dee-grid">
                        <div class="dee-field"><label for="dee-title">Title</label><input id="dee-title" maxlength="256" placeholder="e.g. Donation Price List"></div>
                        <div class="dee-field"><label for="dee-color">Accent color</label><input id="dee-color" maxlength="7" value="#2563EB" placeholder="#2563EB"></div>
                        <div class="dee-field full"><label for="dee-description">Description</label><div class="dee-toolbar" role="toolbar" aria-label="Description formatting"><button type="button" data-format="bold" title="Bold">B</button><button type="button" data-format="italic" title="Italic"><i>I</i></button><button type="button" data-format="underline" title="Underline"><u>U</u></button><button type="button" data-format="strike" title="Strikethrough"><s>S</s></button><span class="toolbar-sep"></span><button type="button" data-format="quote" title="Quote">❝</button><button type="button" data-format="code" title="Inline code">&lt;&gt;</button><button type="button" data-format="spoiler" title="Spoiler">⊙</button><button type="button" data-format="link" title="Link">↗</button></div><textarea id="dee-description" maxlength="4000" placeholder="Write your donation information here..."></textarea></div>
                        <div class="dee-field"><label for="dee-image">Large image URL</label><input id="dee-image" maxlength="2048" placeholder="https://..."></div>
                        <div class="dee-field"><label for="dee-thumbnail">Thumbnail URL</label><input id="dee-thumbnail" maxlength="2048" placeholder="https://..."></div>
                        <div class="dee-field"><label for="dee-author">Author</label><input id="dee-author" maxlength="256" placeholder="GTA Pinas Treasury"></div>
                        <div class="dee-field"><label for="dee-footer">Footer</label><input id="dee-footer" maxlength="2048" placeholder="GTA Pinas Treasury"></div>
                    </div>
                    <div class="dee-actions">
                        <button class="btn btn-outline" type="button" onclick="window.donationEmbedEditor.reset()"><i data-lucide="rotate-ccw" size="15"></i> Reset</button>
                        <button id="dee-send-button" class="btn btn-success" type="button" onclick="window.donationEmbedEditor.send()"><i data-lucide="send" size="15"></i> Send to Discord</button>
                    </div>
                    <div class="dee-send-box"><label for="dee-channel">Donation channel</label><select id="dee-channel"><option value="">Loading channels...</option></select><div id="dee-status" class="dee-status"></div></div>
                </section>
                <section class="dee-card dee-preview-wrap"><div class="dee-preview-label"><strong>Discord preview</strong><button class="dee-preview-trigger" type="button" onclick="window.donationEmbedEditor.preview()">Preview</button></div><div id="dee-preview" class="dee-discord"></div></section>
            </div>`;
        main.appendChild(section);
        bindToolbar();
    }

    function formData() {
        return {
            title: document.getElementById('dee-title')?.value || '', description: document.getElementById('dee-description')?.value || '', color: document.getElementById('dee-color')?.value || '', image: document.getElementById('dee-image')?.value || '', thumbnail: document.getElementById('dee-thumbnail')?.value || '', author: document.getElementById('dee-author')?.value || '', footer: document.getElementById('dee-footer')?.value || ''
        };
    }

    function formatInline(value) {
        let text = esc(value);
        text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
        text = text.replace(/~~([^~]+)~~/g, '<span class="discord-strike">$1</span>');
        text = text.replace(/\|\|([^|]+)\|\|/g, '<span class="discord-spoiler">$1</span>');
        text = text.replace(/`([^`]+)`/g, '<span class="discord-code">$1</span>');
        text = text.replace(/\*\*([^*]+)\*\*/g, '<span class="discord-bold">$1</span>');
        text = text.replace(/__([^_]+)__/g, '<span class="discord-underline">$1</span>');
        text = text.replace(/\*([^*]+)\*/g, '<span class="discord-italic">$1</span>');
        text = text.replace(/_([^_]+)_/g, '<span class="discord-italic">$1</span>');
        return text;
    }

    function renderDescription(value) {
        const raw = String(value || '').replace(/\r\n/g, '\n');
        const lines = raw.split('\n');
        const output = [];
        let list = null;

        const flushList = () => {
            if (!list) return;
            output.push(`<ul class="discord-list">${list.map(item => `<li>${item}</li>`).join('')}</ul>`);
            list = null;
        };

        lines.forEach((line) => {
            const trimmed = line.trim();
            if (!trimmed) {
                flushList();
                output.push('<div style="height:6px"></div>');
                return;
            }

            const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
            if (heading) {
                flushList();
                output.push(`<div class="discord-heading">${formatInline(heading[2])}</div>`);
                return;
            }

            const quote = trimmed.match(/^>\s?(.*)$/);
            if (quote) {
                flushList();
                output.push(`<div class="discord-quote">${formatInline(quote[1])}</div>`);
                return;
            }

            const bullet = trimmed.match(/^[-*•]\s+(.+)$/);
            if (bullet) {
                if (!list) list = [];
                list.push(formatInline(bullet[1]));
                return;
            }

            flushList();
            output.push(`<div>${formatInline(trimmed)}</div>`);
        });
        flushList();
        return output.join('');
    }

    function renderPreview() {
        const data = formData();
        const colorRaw = String(data.color || '').trim().replace(/^#/, '');
        const color = /^[0-9a-fA-F]{6}$/.test(colorRaw) ? `#${colorRaw}` : '#5865F2';
        const image = safeUrl(data.image), thumbnail = safeUrl(data.thumbnail), preview = document.getElementById('dee-preview');
        if (!preview) return;
        preview.innerHTML = `
            <div class="dee-discord-user"><div class="dee-discord-avatar">5A</div><div><strong>GTA Pinas Treasury</strong><span>Today at ${new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span></div></div>
            <div class="dee-embed${thumbnail ? ' has-thumbnail' : ''}" style="border-left-color:${esc(color)}">
                ${thumbnail ? `<img class="dee-embed-thumbnail" src="${esc(thumbnail)}" alt="" onerror="this.style.display='none'">` : ''}
                <div class="dee-embed-main">
                    ${data.author ? `<div class="dee-embed-author">${esc(data.author)}</div>` : ''}
                    ${data.title ? `<div class="dee-embed-title">${esc(data.title)}</div>` : ''}
                    ${data.description ? `<div class="dee-embed-description">${renderDescription(data.description)}</div>` : '<div class="dee-embed-description" style="opacity:.5">Start typing to preview your message.</div>'}
                    ${image ? `<img class="dee-embed-image" src="${esc(image)}" alt="" onerror="this.style.display='none'">` : ''}
                    ${data.footer ? `<div class="dee-embed-footer">${esc(data.footer)}</div>` : ''}
                </div>
            </div>`;
    }

    function applyFormat(format) {
        const textarea = document.getElementById('dee-description');
        if (!textarea) return;
        const start = textarea.selectionStart ?? 0;
        const end = textarea.selectionEnd ?? start;
        const selected = textarea.value.slice(start, end);
        const config = {
            bold: ['**', '**', 'bold text'],
            italic: ['*', '*', 'italic text'],
            underline: ['__', '__', 'underlined text'],
            strike: ['~~', '~~', 'struck text'],
            quote: ['> ', '', 'quote'],
            code: ['`', '`', 'code'],
            spoiler: ['||', '||', 'spoiler'],
            link: ['[', '](https://example.com)', 'link text'],
        };
        const [before, after, fallback] = config[format] || ['', '', ''];
        const content = selected || fallback;
        textarea.setRangeText(`${before}${content}${after}`, start, end, 'select');
        textarea.focus();
        renderPreview();
    }

    function bindToolbar() {
        const textarea = document.getElementById('dee-description');
        const toolbar = document.querySelector('#view-donation-embed-editor .dee-toolbar');
        if (!textarea || !toolbar || state.shortcutBound) return;
        state.shortcutBound = true;
        toolbar.querySelectorAll('button[data-format]').forEach((button) => {
            button.addEventListener('click', () => applyFormat(button.dataset.format));
        });
        textarea.addEventListener('input', renderPreview);
        ['dee-title','dee-color','dee-image','dee-thumbnail','dee-author','dee-footer'].forEach((id) => document.getElementById(id)?.addEventListener('input', renderPreview));
        textarea.addEventListener('keydown', (event) => {
            const key = event.key.toLowerCase();
            if (!event.ctrlKey && !event.metaKey) return;
            const formats = { b: 'bold', i: 'italic', u: 'underline', s: 'strike', e: 'code' };
            if (formats[key]) {
                event.preventDefault();
                applyFormat(formats[key]);
            }
        });
    }

    async function loadChannels() {
        const select = document.getElementById('dee-channel'); if (!select) return;
        try {
            const response = await fetch('/api/donation/channels', { cache: 'no-store' });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.error || 'Unable to load donation channels.');
            state.channels = Array.isArray(payload.channels) ? payload.channels : [];
            select.innerHTML = state.channels.length ? '<option value="">Select a channel...</option>' + state.channels.map(channel => `<option value="${esc(channel.id)}">#${esc(channel.name)}</option>`).join('') : '<option value="">No donation channels configured</option>';
        } catch (error) { select.innerHTML = '<option value="">Unable to load donation channels</option>'; setStatus(error.message, 'error'); }
    }

    function setStatus(message, type = '') { const element = document.getElementById('dee-status'); if (!element) return; element.textContent = message || ''; element.className = `dee-status ${type}`.trim(); }

    function reset() {
        ['dee-title','dee-description','dee-image','dee-thumbnail','dee-author','dee-footer'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
        const color = document.getElementById('dee-color'); if (color) color.value = '#2563EB';
        const select = document.getElementById('dee-channel'); if (select) select.value = '';
        setStatus(''); renderPreview();
    }

    async function send() {
        const select = document.getElementById('dee-channel'), button = document.getElementById('dee-send-button'), channelId = select?.value || '', embed = formData();
        if (!channelId) return setStatus('Select a donation channel first.', 'error');
        if (!embed.description.trim()) return setStatus('Description is required.', 'error');
        if (embed.color && !/^#?[0-9a-fA-F]{6}$/.test(embed.color.trim())) return setStatus('Color must be a 6-digit hexadecimal value.', 'error');
        if (embed.image && !safeUrl(embed.image)) return setStatus('Image URL must use HTTP or HTTPS.', 'error');
        if (embed.thumbnail && !safeUrl(embed.thumbnail)) return setStatus('Thumbnail URL must use HTTP or HTTPS.', 'error');
        button?.setAttribute('disabled', 'disabled'); setStatus('Sending to Discord...');
        try {
            const response = await fetch('/api/donation/embed', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channelId, embed }) });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.error || 'Unable to send embed.');
            setStatus(`Sent successfully to #${payload.channel?.name || 'donation channel'}.`, 'success');
        } catch (error) { setStatus(error.message || 'Unable to send embed.', 'error'); }
        finally { button?.removeAttribute('disabled'); }
    }

    function openEditor() {
        document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
        document.querySelector('[data-target="view-donation-embed-editor"]')?.classList.add('active');
        document.querySelectorAll('.view-section').forEach(section => section.classList.remove('active'));
        document.getElementById('view-donation-embed-editor')?.classList.add('active');
        document.body.classList.remove('transcript-workspace-active');
        if (window.renderPanelIcons) window.renderPanelIcons();
        renderPreview(); loadChannels();
        if (typeof window.toggleMobileSidebar === 'function') window.toggleMobileSidebar(false);
        bindToolbar();
    }

    window.donationEmbedEditor = { reset, preview: renderPreview, send, open: openEditor };

    function init() {
        if (state.initialized) return; state.initialized = true; injectStyles(); buildSidebarItem(); buildView();
        if (window.renderPanelIcons) window.renderPanelIcons();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();
