'use strict';

(() => {
  let accessPayload = { sessions: [], events: [], summary: {} };
  let accessLogsLoading = false;
  let lastAccessLoadAt = 0;

  function html(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function attr(value) {
    return html(value).replaceAll('`', '&#096;');
  }

  function initials(name) {
    const parts = String(name || 'Unknown User').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 'UN';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
  }

  function validImageUrl(value) {
    try {
      const url = new URL(String(value || ''));
      return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
    } catch (_) {
      return '';
    }
  }

  function formatDate(value) {
    if (!value) return 'Not recorded';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Not recorded';
    return date.toLocaleString();
  }

  function relativeTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Unknown time';
    const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
    if (seconds < 10) return 'Just now';
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  function describeUserAgent(userAgent) {
    const ua = String(userAgent || '');
    if (!ua) return { name: 'Not recorded', detail: 'Unknown browser' };

    let browser = 'Browser';
    if (/Edg\//i.test(ua)) browser = 'Microsoft Edge';
    else if (/OPR\//i.test(ua)) browser = 'Opera';
    else if (/Firefox\//i.test(ua)) browser = 'Firefox';
    else if (/Chrome\//i.test(ua)) browser = 'Google Chrome';
    else if (/Safari\//i.test(ua)) browser = 'Safari';

    let device = 'Unknown device';
    if (/Windows NT/i.test(ua)) device = 'Windows';
    else if (/Android/i.test(ua)) device = 'Android';
    else if (/iPhone|iPad|iPod/i.test(ua)) device = 'iPhone / iPad';
    else if (/Macintosh|Mac OS X/i.test(ua)) device = 'macOS';
    else if (/Linux/i.test(ua)) device = 'Linux';

    return { name: browser, detail: device };
  }

  function eventInfo(type) {
    const map = {
      login_success: { label: 'Authorized', className: 'success', icon: 'log-in' },
      login_denied: { label: 'Denied', className: 'denied', icon: 'shield-x' },
      logout: { label: 'Signed Out', className: 'logout', icon: 'log-out' },
      access_revoked: { label: 'Access Revoked', className: 'revoked', icon: 'shield-alert' },
    };
    return map[type] || { label: String(type || 'Unknown').replaceAll('_', ' '), className: 'unknown', icon: 'circle-help' };
  }

  function eventDetails(event) {
    const metadata = event?.metadata && typeof event.metadata === 'object' ? event.metadata : {};
    if (event.eventType === 'login_success') {
      return metadata.roleName ? `Authorized as ${metadata.roleName}` : 'Discord authorization completed.';
    }
    if (event.eventType === 'login_denied') {
      const reason = String(metadata.code || 'not_authorized').replaceAll('_', ' ');
      return `Reason: ${reason}`;
    }
    if (event.eventType === 'logout') return 'The user signed out of the Web Panel.';
    if (event.eventType === 'access_revoked') return 'Session removed after Discord access verification failed.';
    return Object.keys(metadata).length ? JSON.stringify(metadata) : 'No additional details.';
  }

  function personCell({ displayName, username, userId, avatarUrl }) {
    const shownName = displayName || username || 'Unknown User';
    const avatar = validImageUrl(avatarUrl);
    return `
      <div class="access-person">
        <div class="access-avatar">
          <span>${html(initials(shownName))}</span>
          ${avatar ? `<img src="${attr(avatar)}" alt="" loading="lazy" onerror="this.remove()">` : ''}
        </div>
        <div class="access-person-copy">
          <strong title="${attr(shownName)}">${html(shownName)}</strong>
          <small>${username ? `@${html(username)}` : 'Discord identity unavailable'}</small>
          ${userId ? `<code title="Discord User ID">${html(userId)}</code>` : ''}
        </div>
      </div>
    `;
  }

  function updateSummary() {
    const summary = accessPayload.summary || {};
    const values = {
      'access-online-users': summary.onlineUsers || 0,
      'access-active-sessions': summary.activeSessions || 0,
      'access-authorized-24h': summary.authorized24h || 0,
      'access-denied-24h': summary.denied24h || 0,
    };
    Object.entries(values).forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (element) element.textContent = String(value);
    });
  }

  function renderSessions() {
    const body = document.getElementById('access-session-body');
    if (!body) return;
    const sessions = Array.isArray(accessPayload.sessions) ? accessPayload.sessions : [];

    if (!sessions.length) {
      body.innerHTML = '<tr><td colspan="7" class="access-empty">No active Web Panel sessions were found.</td></tr>';
      return;
    }

    body.innerHTML = sessions.map(session => {
      const device = describeUserAgent(session.userAgent);
      return `
        <tr>
          <td>${personCell(session)}</td>
          <td><span class="access-status ${session.isOnline ? 'online' : 'idle'}">${session.isOnline ? 'Online' : 'Idle'}</span></td>
          <td><span class="access-role">${html(session.roleName || 'Authorized Staff')}</span></td>
          <td><span class="access-mono">${html(session.ipAddress || 'Not recorded')}</span></td>
          <td>
            <div class="access-device" title="${attr(session.userAgent || '')}">
              <strong>${html(device.name)}</strong><small>${html(device.detail)}</small>
            </div>
          </td>
          <td><div class="access-time"><strong>${html(relativeTime(session.lastSeenAt))}</strong><small>${html(formatDate(session.lastSeenAt))}</small></div></td>
          <td><div class="access-time"><strong>${html(futureTime(session.expiresAt))}</strong><small>${html(formatDate(session.expiresAt))}</small></div></td>
        </tr>
      `;
    }).join('');
  }

  function futureTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Unknown';
    const seconds = Math.floor((date.getTime() - Date.now()) / 1000);
    if (seconds <= 0) return 'Expired';
    if (seconds < 60) return `in ${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `in ${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `in ${hours}h`;
    return `in ${Math.floor(hours / 24)}d`;
  }

  function filteredEvents() {
    const query = String(document.getElementById('access-log-search')?.value || '').trim().toLowerCase();
    const filter = String(document.getElementById('access-log-event-filter')?.value || 'all');
    const events = Array.isArray(accessPayload.events) ? accessPayload.events : [];

    return events.filter(event => {
      if (filter !== 'all' && event.eventType !== filter) return false;
      if (!query) return true;
      const haystack = [
        event.username,
        event.userId,
        event.ipAddress,
        event.eventType,
        eventDetails(event),
        event.userAgent,
      ].join(' ').toLowerCase();
      return haystack.includes(query);
    });
  }

  window.renderAccessLogEvents = function renderAccessLogEvents() {
    const body = document.getElementById('access-event-body');
    if (!body) return;
    const events = filteredEvents();
    const count = document.getElementById('access-event-count');
    if (count) count.textContent = `${events.length} event${events.length === 1 ? '' : 's'}`;

    if (!events.length) {
      body.innerHTML = '<tr><td colspan="6" class="access-empty">No authorization events match the selected filter.</td></tr>';
      return;
    }

    body.innerHTML = events.map(event => {
      const info = eventInfo(event.eventType);
      const device = describeUserAgent(event.userAgent);
      return `
        <tr>
          <td><div class="access-time"><strong>${html(formatDate(event.createdAt))}</strong><small>${html(relativeTime(event.createdAt))}</small></div></td>
          <td>${personCell({ displayName: event.username, username: event.username, userId: event.userId })}</td>
          <td><span class="access-event-badge ${info.className}"><i data-lucide="${info.icon}" size="12"></i>${html(info.label)}</span></td>
          <td><span class="access-mono">${html(event.ipAddress || 'Not recorded')}</span></td>
          <td><div class="access-device" title="${attr(event.userAgent || '')}"><strong>${html(device.name)}</strong><small>${html(device.detail)}</small></div></td>
          <td><div class="access-detail">${html(eventDetails(event))}</div></td>
        </tr>
      `;
    }).join('');

    if (window.renderPanelIcons) window.renderPanelIcons({ root: body });
  };

  function setLoadingState() {
    const sessionBody = document.getElementById('access-session-body');
    const eventBody = document.getElementById('access-event-body');
    const loading = '<span class="access-loading"><i data-lucide="loader-circle" size="15"></i>Loading access data...</span>';
    if (sessionBody) sessionBody.innerHTML = `<tr><td colspan="7" class="access-empty">${loading}</td></tr>`;
    if (eventBody) eventBody.innerHTML = `<tr><td colspan="6" class="access-empty">${loading}</td></tr>`;
    const view = document.getElementById('view-access-logs');
    if (window.renderPanelIcons && view) window.renderPanelIcons({ root: view });
  }

  window.loadAccessLogs = async function loadAccessLogs(options = {}) {
    if (typeof panelOwnerToolsEnabled === 'undefined' || panelOwnerToolsEnabled !== true) return;
    const quiet = Boolean(options.quiet);
    const force = Boolean(options.force);
    if (accessLogsLoading) return;
    if (!force && Date.now() - lastAccessLoadAt < 8_000 && accessPayload.events.length) return;

    accessLogsLoading = true;
    if (!quiet && !accessPayload.events.length) setLoadingState();

    try {
      const response = await fetch('/api/access-logs?limit=200', {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Unable to load Access Logs.');

      accessPayload = {
        sessions: Array.isArray(data.sessions) ? data.sessions : [],
        events: Array.isArray(data.events) ? data.events : [],
        summary: data.summary || {},
        generatedAt: data.generatedAt || new Date().toISOString(),
      };
      lastAccessLoadAt = Date.now();

      updateSummary();
      renderSessions();
      window.renderAccessLogEvents();

      const updated = document.getElementById('access-session-updated');
      if (updated) updated.textContent = `Updated ${formatDate(accessPayload.generatedAt)}`;
      const view = document.getElementById('view-access-logs');
      if (window.renderPanelIcons && view) window.renderPanelIcons({ root: view });
      if (force && typeof window.showToast === 'function') window.showToast('Access Logs refreshed.', 'success');
    } catch (error) {
      const sessionBody = document.getElementById('access-session-body');
      const eventBody = document.getElementById('access-event-body');
      const message = html(error.message || 'Unable to load Access Logs.');
      if (sessionBody) sessionBody.innerHTML = `<tr><td colspan="7" class="access-empty">${message}</td></tr>`;
      if (eventBody) eventBody.innerHTML = `<tr><td colspan="6" class="access-empty">${message}</td></tr>`;
      if (!quiet && typeof window.showToast === 'function') window.showToast(error.message || 'Unable to load Access Logs.', 'error');
    } finally {
      accessLogsLoading = false;
    }
  };

  window.setInterval(() => {
    const view = document.getElementById('view-access-logs');
    if (view?.classList.contains('active') && document.visibilityState === 'visible') {
      window.loadAccessLogs({ quiet: true, force: true });
    }
  }, 60_000);
})();
