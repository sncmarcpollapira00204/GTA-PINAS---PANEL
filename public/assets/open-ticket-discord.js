'use strict';

(() => {
  const STYLE_ID = 'open-ticket-discord-styles';

  function escapeHTML(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function displayDate(value, includeTime = false) {
    if (!value) return 'Not recorded';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Not recorded';
    return includeTime ? date.toLocaleString() : date.toLocaleDateString();
  }

  function safeHttpUrl(value) {
    try {
      const url = new URL(String(value || ''));
      return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
    } catch (_) {
      return '';
    }
  }

  function discordAppUrl(value) {
    try {
      const url = new URL(String(value || ''));
      const hostname = url.hostname.toLowerCase();
      if (!['discord.com', 'www.discord.com'].includes(hostname)) return '';

      const match = url.pathname.match(/^\/channels\/(\d{15,22}|@me)\/(\d{15,22})(?:\/(\d{15,22}))?\/?$/);
      if (!match) return '';

      const [, guildId, channelId, messageId] = match;
      return `discord://-/channels/${guildId}/${channelId}${messageId ? `/${messageId}` : ''}`;
    } catch (_) {
      return '';
    }
  }

  function openDiscordTarget(event) {
    const link = event.currentTarget;
    if (!(link instanceof HTMLAnchorElement)) return;

    const targetUrl = safeHttpUrl(link.dataset.webUrl || link.href);
    const appUrl = String(link.dataset.appUrl || '').trim();
    if (!targetUrl || !appUrl) return;

    event.preventDefault();

    let fallbackTimer = null;
    let appLikelyOpened = false;

    const cleanup = () => {
      if (fallbackTimer) {
        clearTimeout(fallbackTimer);
        fallbackTimer = null;
      }
      window.removeEventListener('blur', markOpened);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };

    const markOpened = () => {
      appLikelyOpened = true;
      cleanup();
    };

    const handleVisibilityChange = () => {
      if (document.hidden) markOpened();
    };

    window.addEventListener('blur', markOpened, { once: true });
    document.addEventListener('visibilitychange', handleVisibilityChange);

    fallbackTimer = window.setTimeout(() => {
      cleanup();
      if (!appLikelyOpened) {
        window.open(targetUrl, '_blank', 'noopener,noreferrer');
      }
    }, 1200);

    window.location.href = appUrl;
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .ticket-summary-discord-card{
        padding:18px!important;
        display:flex!important;
        align-items:center!important;
        justify-content:space-between!important;
        gap:18px!important;
        border:1px solid color-mix(in srgb,var(--primary) 34%,var(--border))!important;
        background:
          radial-gradient(circle at 92% 12%,color-mix(in srgb,var(--primary) 17%,transparent),transparent 38%),
          color-mix(in srgb,var(--bg-card) 94%,var(--primary) 6%)!important;
      }
      .ticket-summary-discord-copy{
        min-width:0!important;
        display:flex!important;
        align-items:flex-start!important;
        gap:12px!important;
      }
      .ticket-summary-discord-icon{
        width:38px!important;
        height:38px!important;
        flex:0 0 38px!important;
        display:grid!important;
        place-items:center!important;
        border-radius:10px!important;
        color:#fff!important;
        background:var(--primary)!important;
        box-shadow:0 8px 22px color-mix(in srgb,var(--primary) 24%,transparent)!important;
      }
      .ticket-summary-discord-copy strong{
        display:block!important;
        margin-bottom:5px!important;
        color:var(--text-main)!important;
        font-size:13px!important;
      }
      .ticket-summary-discord-copy p{
        margin:0!important;
        max-width:520px!important;
        color:var(--text-sec)!important;
        font-size:11px!important;
        line-height:1.55!important;
      }
      .ticket-summary-discord-action{
        min-width:150px!important;
        flex:0 0 auto!important;
        text-decoration:none!important;
      }
      .ticket-summary-discord-action.disabled{
        pointer-events:none!important;
        opacity:.48!important;
      }
      @media(max-width:620px){
        .ticket-summary-discord-card{
          align-items:stretch!important;
          flex-direction:column!important;
        }
        .ticket-summary-discord-action{width:100%!important;}
      }
    `;
    document.head.appendChild(style);
  }

  function renderIcons(root) {
    if (typeof window.renderPanelIcons === 'function') {
      window.renderPanelIcons({ root, immediate: true });
      return;
    }
    if (window.lucide) window.lucide.createIcons();
  }

  function openDiscordMarkup(ticket, discord) {
    const targetUrl = safeHttpUrl(discord?.targetUrl);
    const appUrl = discordAppUrl(targetUrl);
    const isClosed = ticket.status === 'closed';
    const title = isClosed ? 'Open the Discord transcript reference' : 'Continue this ticket in Discord';
    const description = targetUrl
      ? (isClosed
          ? 'This ticket is closed. View the transcript in Discord.'
          : 'The live conversation preview was removed.')
      : 'A valid Discord channel or transcript link is not available for this ticket.';

    return `
      <div class="detail-group">
        <label>${isClosed ? 'Discord Reference' : 'Ticket Conversation'}</label>
        <div class="detail-box ticket-summary-discord-card">
          <div class="ticket-summary-discord-copy">
            <span class="ticket-summary-discord-icon"><i data-lucide="message-circle" size="20"></i></span>
            <div>
              <strong>${escapeHTML(title)}</strong>
              <p>${escapeHTML(description)}</p>
            </div>
          </div>
          <a class="btn btn-primary ticket-summary-discord-action ${targetUrl ? '' : 'disabled'}"
             href="${targetUrl ? escapeHTML(targetUrl) : '#'}"
             data-web-url="${targetUrl ? escapeHTML(targetUrl) : ''}"
             data-app-url="${appUrl ? escapeHTML(appUrl) : ''}"
             target="_blank"
             rel="noopener noreferrer"
             aria-disabled="${String(!targetUrl)}">
            <i data-lucide="external-link" size="16"></i>
            Open in Discord
          </a>
        </div>
      </div>
    `;
  }

  async function loadDiscordOnlyTicketPanel(id, quiet = false) {
    // Automatic conversation polling is intentionally disabled. Staff can use
    // the explicit Refresh Ticket button when they need updated ticket status.
    if (quiet) return;

    const contentArea = document.getElementById('panel-content-area');
    const footerArea = document.getElementById('panel-footer-area');
    const panel = document.getElementById('side-panel');
    if (!contentArea || !footerArea || !panel) return;

    contentArea.innerHTML = `
      <div style="padding:30px;text-align:center;color:var(--text-sec);">
        Loading ticket details.
      </div>
    `;
    footerArea.innerHTML = '';

    try {
      const response = await fetch(`/api/tickets/${encodeURIComponent(id)}/summary`, {
        cache: 'no-store',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.error || !data.ticket) {
        throw new Error(data.error || 'Unable to load ticket.');
      }

      const ticket = data.ticket;
      const isClosed = ticket.status === 'closed';
      const avatar = safeHttpUrl(ticket.user_avatar)
        || 'https://placehold.co/100x100/111827/FFFFFF?text=U';
      const claimedName = ticket.claimed_by_username || ticket.claimed_by || 'Not claimed';
      const assignedName = ticket.staff_username || ticket.assigned_to || 'Not assigned';
      const closedName = ticket.closed_by_username || ticket.closed_by || 'Not closed';

      const statusDetails = isClosed
        ? `
          <div style="display:flex;justify-content:space-between;margin-bottom:12px;gap:20px;">
            <span style="color:var(--text-sec)">Closed By</span>
            <strong style="text-align:right;">${escapeHTML(closedName)}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;margin-bottom:12px;gap:20px;">
            <span style="color:var(--text-sec)">Closed At</span>
            <span style="text-align:right;">${escapeHTML(displayDate(ticket.closed_at, true))}</span>
          </div>
          <div style="display:flex;justify-content:space-between;gap:20px;">
            <span style="color:var(--text-sec)">Close Reason</span>
            <span style="text-align:right;word-break:break-word;">${escapeHTML(ticket.close_reason || 'Closed by administrator')}</span>
          </div>
        `
        : `
          <div style="display:flex;justify-content:space-between;gap:20px;">
            <span style="color:var(--text-sec)">Last Activity</span>
            <span style="text-align:right;">${escapeHTML(displayDate(ticket.last_activity_at, true))}</span>
          </div>
        `;

      contentArea.innerHTML = `
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:26px;">
          <img src="${escapeHTML(avatar)}" alt="" style="width:56px;height:56px;object-fit:cover;border-radius:50%;border:2px solid var(--border);">
          <div style="min-width:0;">
            <h2 style="font-size:20px;margin-bottom:4px;overflow-wrap:anywhere;">${escapeHTML(ticket.user_username || 'Unknown User')}</h2>
            <p style="font-size:13px;font-family:monospace;overflow-wrap:anywhere;">ID: ${escapeHTML(ticket.user_id || 'Unknown')}</p>
          </div>
        </div>

        <div class="detail-group">
          <label>Ticket Information</label>
          <div class="detail-box">
            <div style="display:flex;justify-content:space-between;margin-bottom:12px;gap:20px;">
              <span style="color:var(--text-sec)">Ticket Number</span>
              <span style="font-family:monospace;text-align:right;">#${escapeHTML(ticket.ticket_number || ticket.id)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;margin-bottom:12px;gap:20px;">
              <span style="color:var(--text-sec)">Discord Channel</span>
              <span style="text-align:right;word-break:break-all;">${escapeHTML(ticket.channel_name || ticket.channel_id || 'Unknown')}</span>
            </div>
            <div style="display:flex;justify-content:space-between;margin-bottom:12px;gap:20px;">
              <span style="color:var(--text-sec)">Category</span>
              <span style="text-align:right;">${escapeHTML(ticket.category || 'General')}</span>
            </div>
            <div style="display:flex;justify-content:space-between;margin-bottom:12px;gap:20px;">
              <span style="color:var(--text-sec)">Status</span>
              <span class="badge" style="background:${isClosed ? 'rgba(46,204,113,0.13)' : 'rgba(88,101,242,0.13)'};color:${isClosed ? 'var(--success)' : 'var(--primary)'};">
                ${escapeHTML(ticket.status || 'open')}
              </span>
            </div>
            <div style="display:flex;justify-content:space-between;margin-bottom:12px;gap:20px;">
              <span style="color:var(--text-sec)">Created</span>
              <span style="text-align:right;">${escapeHTML(displayDate(ticket.created_at, true))}</span>
            </div>
            <div style="display:flex;justify-content:space-between;gap:20px;">
              <span style="color:var(--text-sec)">Priority</span>
              <span class="badge badge-priority-${escapeHTML(ticket.priority || 'normal')}">${escapeHTML(ticket.priority || 'normal')}</span>
            </div>
          </div>
        </div>

        <div class="detail-group">
          <label>Handling Status</label>
          <div class="detail-box">
            <div style="display:flex;justify-content:space-between;margin-bottom:12px;gap:20px;">
              <span style="color:var(--text-sec)">Claimed By</span>
              <strong style="text-align:right;overflow-wrap:anywhere;">${escapeHTML(claimedName)}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;margin-bottom:12px;gap:20px;">
              <span style="color:var(--text-sec)">Assigned To</span>
              <strong style="text-align:right;overflow-wrap:anywhere;">${escapeHTML(assignedName)}</strong>
            </div>
            ${statusDetails}
          </div>
        </div>

        ${openDiscordMarkup(ticket, data.discord || {})}
      `;

      const discordAction = contentArea.querySelector('.ticket-summary-discord-action[data-app-url]');
      if (discordAction?.dataset.appUrl) {
        discordAction.addEventListener('click', openDiscordTarget);
      }

      footerArea.innerHTML = isClosed
        ? `
          <button class="btn btn-primary" style="flex:1;" onclick="viewTranscript('${escapeHTML(ticket.id)}')">View Transcript</button>
          <button class="btn btn-outline" style="flex:1;" onclick="closePanel()">Close Inspector</button>
        `
        : `
          <button class="btn btn-primary" style="flex:1;" onclick="loadTicketPanel('${escapeHTML(ticket.id)}')">Refresh Ticket</button>
          <button class="btn btn-outline" style="flex:1;" onclick="closePanel()">Close Inspector</button>
        `;

      renderIcons(panel);
    } catch (error) {
      contentArea.innerHTML = `
        <div style="padding:24px;color:var(--danger);">
          ${escapeHTML(error.message || 'Unable to load ticket.')}
        </div>
      `;
      footerArea.innerHTML = '<button class="btn btn-outline" style="flex:1;" onclick="closePanel()">Close Inspector</button>';
    }
  }

  function init() {
    installStyles();
    window.loadTicketPanel = loadDiscordOnlyTicketPanel;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
