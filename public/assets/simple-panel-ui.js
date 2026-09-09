'use strict';

(() => {
  const UI_STORAGE_KEY = '5thAvenuePanelUI.v4';
  const IMPORT_CATEGORIES = [
    { key: 'report', label: 'Import Report Tickets' },
    { key: 'partnership', label: 'Import Partnership Tickets' },
    { key: 'pov_check', label: 'Import POV Tickets' },
    { key: 'boost_claim', label: 'Import Boost Tickets' },
    { key: 'ban_appeal', label: 'Import Ban Tickets' },
  ];

  let activeImportJob = null;
  let importBusy = false;
  let accessLoaded = false;

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function renderIcons(root = document) {
    if (typeof window.renderPanelIcons === 'function') {
      window.renderPanelIcons({ root });
    } else if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  function toast(message, type = 'success') {
    if (typeof window.showToast === 'function') {
      window.showToast(message, type);
    }
  }

  async function requestJson(url, options = {}) {
    const response = await fetch(url, {
      cache: 'no-store',
      credentials: 'same-origin',
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || `Request failed (${response.status}).`);
    }
    return payload;
  }

  function sleep(milliseconds) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }

  function installStyles() {
    if (document.getElementById('simple-panel-ui-styles')) return;

    const style = document.createElement('style');
    style.id = 'simple-panel-ui-styles';
    style.textContent = `
      .simple-page{max-width:1050px;display:flex;flex-direction:column;gap:14px}
      .simple-page .page-header{margin-bottom:4px;align-items:center}
      .simple-page .page-header h1{font-size:24px}
      .simple-card{padding:18px;border:1px solid var(--border);border-radius:10px;background:var(--bg-card)}
      .simple-card:hover{transform:none!important;box-shadow:none!important}
      .simple-card h2{font-size:15px;margin:0 0 5px}
      .simple-card>p{font-size:11px;margin:0;color:var(--text-sec)}
      .simple-button-list{margin-top:15px;border:1px solid var(--border);border-radius:9px;overflow:hidden}
      .simple-import-row{min-height:58px;display:flex;align-items:center;justify-content:space-between;gap:14px;padding:10px 12px;border-bottom:1px solid var(--border);background:var(--bg-main)}
      .simple-import-row:last-child{border-bottom:0}
      .simple-import-row strong{display:block;font-size:12px;color:var(--text-main)}
      .simple-import-row span{display:block;margin-top:3px;font-size:9px;color:var(--text-sec)}
      .simple-import-row .btn{min-width:190px}
      .simple-job-status{display:none;margin-top:14px;padding:12px;border:1px solid var(--border);border-radius:8px;background:var(--bg-main)}
      .simple-job-status.show{display:block}
      .simple-job-head{display:flex;align-items:center;justify-content:space-between;gap:12px}
      .simple-job-head strong{font-size:11px}
      .simple-job-head span{font-size:10px;color:var(--text-sec)}
      .simple-progress{height:6px;margin-top:10px;border-radius:999px;overflow:hidden;background:var(--border)}
      .simple-progress>span{display:block;width:0;height:100%;background:var(--primary);transition:width .25s ease}
      .simple-job-message{margin-top:8px;font-size:10px;color:var(--text-sec)}
      .simple-source-note{font-size:10px;color:var(--text-sec)}

      .simple-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
      .simple-summary>div{padding:13px;border:1px solid var(--border);border-radius:9px;background:var(--bg-card)}
      .simple-summary span{display:block;font-size:9px;color:var(--text-sec)}
      .simple-summary strong{display:block;margin-top:5px;font-size:19px;color:var(--text-main)}
      .simple-table-wrap{border:1px solid var(--border);border-radius:9px;overflow:hidden;background:var(--bg-card)}
      .simple-table-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-bottom:1px solid var(--border)}
      .simple-table-toolbar h2{font-size:13px;margin:0}
      .simple-table{width:100%;border-collapse:collapse}
      .simple-table th,.simple-table td{padding:12px 14px;border-bottom:1px solid var(--border);font-size:11px}
      .simple-table th{font-size:9px;color:var(--text-sec);background:var(--bg-main)}
      .simple-table tbody tr:last-child td{border-bottom:0}
      .simple-table tbody tr{cursor:default}
      .simple-table tbody tr:hover{background:transparent}
      .simple-result{font-weight:700}
      .simple-result.allowed{color:var(--success)}
      .simple-result.denied{color:var(--danger)}
      .simple-empty{padding:28px!important;text-align:center;color:var(--text-sec)}

      .simple-settings-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px}
      .simple-profile{display:flex;align-items:center;gap:14px;margin-top:16px}
      .simple-profile-avatar{width:58px;height:58px;border-radius:50%;object-fit:cover;border:1px solid var(--border);background:var(--bg-main)}
      .simple-profile-fallback{width:58px;height:58px;border-radius:50%;display:grid;place-items:center;border:1px solid var(--border);background:var(--bg-main);font-size:16px;font-weight:700}
      .simple-profile-copy{min-width:0}
      .simple-profile-copy strong{display:block;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .simple-profile-copy span{display:block;margin-top:4px;font-size:10px;color:var(--text-sec);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .simple-info-list{margin-top:14px;border-top:1px solid var(--border)}
      .simple-info-list>div{display:flex;align-items:center;justify-content:space-between;gap:15px;padding:11px 0;border-bottom:1px solid var(--border)}
      .simple-info-list>div:last-child{border-bottom:0}
      .simple-info-list dt{font-size:10px;color:var(--text-sec)}
      .simple-info-list dd{margin:0;font-size:10px;color:var(--text-main);text-align:right;overflow-wrap:anywhere}
      .simple-form{display:flex;flex-direction:column;gap:14px;margin-top:16px}
      .simple-field{display:flex;flex-direction:column;gap:6px}
      .simple-field label{font-size:10px;font-weight:600;color:var(--text-main)}
      .simple-field select{min-height:39px;padding:0 10px;border:1px solid var(--border);border-radius:7px;background:var(--bg-main);color:var(--text-main)}
      .simple-check{display:flex;align-items:flex-start;gap:9px;padding:11px;border:1px solid var(--border);border-radius:8px;background:var(--bg-main)}
      .simple-check input{margin-top:2px}
      .simple-check strong{display:block;font-size:10px}
      .simple-check span{display:block;margin-top:3px;font-size:9px;color:var(--text-sec)}
      .simple-save-row{display:flex;align-items:center;gap:10px;margin-top:2px}
      .simple-save-message{font-size:10px;color:var(--success)}

      #transcript-meta-panel.simple-meta-panel{transition:none!important;overflow:hidden}
      #transcript-meta-panel.simple-meta-panel .transcript-meta-heading{cursor:pointer;user-select:none}
      #transcript-meta-panel.simple-meta-panel .simple-meta-toggle{margin-left:auto;display:grid;place-items:center;width:30px;height:30px;border:1px solid var(--border);border-radius:7px;background:var(--bg-main);color:var(--text-sec);cursor:pointer}
      #transcript-meta-panel.simple-meta-panel.is-collapsed .transcript-meta-list{display:none!important}
      #transcript-meta-panel.simple-meta-panel.is-collapsed{align-self:start;min-height:auto!important}
      #transcript-meta-panel.simple-meta-panel.is-collapsed .transcript-meta-heading{margin:0!important;padding:0!important;border:0!important}
      #transcript-meta-panel.simple-meta-panel.is-collapsed .simple-meta-toggle svg{transform:rotate(180deg)}

      @media(max-width:760px){
        .simple-settings-grid,.simple-summary{grid-template-columns:1fr}
        .simple-import-row{align-items:stretch;flex-direction:column}
        .simple-import-row .btn{width:100%;min-width:0}
        .simple-table-wrap{overflow-x:auto}
        .simple-table{min-width:620px}
      }
    `;
    document.head.appendChild(style);
  }

  function renderImportCenter() {
    const view = document.getElementById('view-import');
    if (!view) return;

    view.innerHTML = `
      <div class="simple-page">
        <div class="page-header">
          <div>
            <div class="page-kicker">Discord transcripts</div>
            <h1>Import Center</h1>
            <p>Import closed tickets from their Discord transcript log channel.</p>
          </div>
        </div>

        <section class="simple-card">
          <h2>Choose a ticket type</h2>
          <p>Press one button. Existing transcripts are updated instead of duplicated.</p>

          <div class="simple-button-list">
            ${IMPORT_CATEGORIES.map((item) => `
              <div class="simple-import-row">
                <div>
                  <strong>${escapeHtml(item.label.replace('Import ', ''))}</strong>
                  <span>Reads the configured Discord transcript channel only.</span>
                </div>
                <button class="btn btn-primary simple-import-button" type="button" data-import-category="${item.key}">
                  <i data-lucide="download" size="15"></i> ${escapeHtml(item.label)}
                </button>
              </div>
            `).join('')}
          </div>

          <div id="simple-import-status" class="simple-job-status" aria-live="polite">
            <div class="simple-job-head">
              <strong id="simple-import-stage">Preparing import</strong>
              <span id="simple-import-percent">0%</span>
            </div>
            <div class="simple-progress"><span id="simple-import-bar"></span></div>
            <div id="simple-import-message" class="simple-job-message">Waiting.</div>
          </div>
        </section>

        <div class="simple-source-note">
          Open tickets are supplied by the live Main Bot database. This page imports closed HTML transcripts only.
        </div>
      </div>
    `;

    view.querySelectorAll('[data-import-category]').forEach((button) => {
      button.addEventListener('click', () => startCategoryImport(button.dataset.importCategory));
    });
    renderIcons(view);
  }

  function setImportButtonsDisabled(disabled, activeCategory = null) {
    document.querySelectorAll('.simple-import-button').forEach((button) => {
      button.disabled = disabled;
      const category = button.dataset.importCategory;
      const item = IMPORT_CATEGORIES.find((entry) => entry.key === category);
      button.innerHTML = disabled && category === activeCategory
        ? '<i data-lucide="loader-circle" size="15"></i> Importing...'
        : `<i data-lucide="download" size="15"></i> ${escapeHtml(item?.label || 'Import')}`;
    });
    renderIcons(document.getElementById('view-import') || document);
  }

  function updateImportStatus(job, fallbackMessage = '') {
    const box = document.getElementById('simple-import-status');
    if (!box) return;

    const progress = Math.max(0, Math.min(100, Number(job?.progress || 0)));
    box.classList.add('show');
    document.getElementById('simple-import-stage').textContent = job?.stage || 'Importing tickets';
    document.getElementById('simple-import-percent').textContent = `${progress}%`;
    document.getElementById('simple-import-bar').style.width = `${progress}%`;
    document.getElementById('simple-import-message').textContent =
      job?.message || fallbackMessage || 'Working...';
  }

  async function startCategoryImport(category) {
    if (importBusy) return;

    importBusy = true;
    activeImportJob = null;
    setImportButtonsDisabled(true, category);
    updateImportStatus({ progress: 0, stage: 'Starting import', message: 'Connecting to Discord...' });

    try {
      const payload = await requestJson(`/api/import/category/${encodeURIComponent(category)}`, {
        method: 'POST',
        body: '{}',
      });
      activeImportJob = payload.job?.id;
      updateImportStatus(payload.job, payload.message);

      while (activeImportJob) {
        await sleep(1200);
        const job = await requestJson(`/api/import/jobs/${encodeURIComponent(activeImportJob)}`);
        updateImportStatus(job);

        if (job.status === 'completed') {
          toast(job.message || 'Ticket import completed.');
          if (typeof window.syncData === 'function') window.syncData(false);
          if (typeof window.renderTranscriptList === 'function') window.renderTranscriptList();
          break;
        }

        if (job.status === 'failed') {
          throw new Error(job.error || job.message || 'Ticket import failed.');
        }
      }
    } catch (error) {
      updateImportStatus({ progress: 0, stage: 'Import failed', message: error.message });
      toast(error.message, 'error');
    } finally {
      activeImportJob = null;
      importBusy = false;
      setImportButtonsDisabled(false);
    }
  }

  function eventLabel(eventType) {
    const labels = {
      login_success: 'Logged in',
      login_denied: 'Denied',
      logout: 'Logged out',
      session_revoked: 'Session ended',
    };
    return labels[eventType] || String(eventType || 'Activity').replaceAll('_', ' ');
  }

  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
  }

  function renderAccessLogs() {
    const view = document.getElementById('view-access-logs');
    if (!view) return;

    view.innerHTML = `
      <div class="simple-page">
        <div class="page-header">
          <div>
            <div class="page-kicker">Panel security</div>
            <h1>Access Logs</h1>
            <p>Recent sign-ins and denied login attempts.</p>
          </div>
          <button id="simple-access-refresh" class="btn btn-outline" type="button">
            <i data-lucide="refresh-cw" size="15"></i> Refresh
          </button>
        </div>

        <div class="simple-summary">
          <div><span>Online now</span><strong id="simple-online-count">—</strong></div>
          <div><span>Successful logins · 24h</span><strong id="simple-success-count">—</strong></div>
          <div><span>Denied logins · 24h</span><strong id="simple-denied-count">—</strong></div>
        </div>

        <section class="simple-table-wrap">
          <div class="simple-table-toolbar"><h2>Recent activity</h2></div>
          <table class="simple-table">
            <thead><tr><th>Date</th><th>Account</th><th>Result</th><th>IP address</th></tr></thead>
            <tbody id="simple-access-body"><tr><td colspan="4" class="simple-empty">Loading...</td></tr></tbody>
          </table>
        </section>
      </div>
    `;

    document.getElementById('simple-access-refresh')?.addEventListener('click', loadSimpleAccessLogs);
    renderIcons(view);
  }

  async function loadSimpleAccessLogs() {
    const body = document.getElementById('simple-access-body');
    if (!body) return;

    body.innerHTML = '<tr><td colspan="4" class="simple-empty">Loading...</td></tr>';

    try {
      const data = await requestJson('/api/access-logs?limit=75');
      document.getElementById('simple-online-count').textContent = data.summary?.onlineUsers ?? 0;
      document.getElementById('simple-success-count').textContent = data.summary?.authorized24h ?? 0;
      document.getElementById('simple-denied-count').textContent = data.summary?.denied24h ?? 0;

      const events = Array.isArray(data.events) ? data.events : [];
      body.innerHTML = events.length
        ? events.map((event) => {
            const denied = event.eventType === 'login_denied';
            return `
              <tr>
                <td>${escapeHtml(formatDate(event.createdAt))}</td>
                <td>${escapeHtml(event.username || event.userId || 'Unknown account')}</td>
                <td><span class="simple-result ${denied ? 'denied' : 'allowed'}">${escapeHtml(eventLabel(event.eventType))}</span></td>
                <td>${escapeHtml(event.ipAddress || '—')}</td>
              </tr>
            `;
          }).join('')
        : '<tr><td colspan="4" class="simple-empty">No access activity found.</td></tr>';
      accessLoaded = true;
    } catch (error) {
      body.innerHTML = `<tr><td colspan="4" class="simple-empty">${escapeHtml(error.message)}</td></tr>`;
    }
  }

  function currentSavedSettings() {
    try {
      return JSON.parse(localStorage.getItem(UI_STORAGE_KEY) || '{}');
    } catch (_) {
      return {};
    }
  }

  function initials(value) {
    return String(value || 'Admin')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || 'A';
  }

  function renderSettings() {
    const view = document.getElementById('view-settings');
    if (!view) return;

    const saved = currentSavedSettings();
    const theme = saved.theme === 'light' ? 'light' : 'dark';
    const liveUpdates = saved.autoRefresh !== false;

    view.innerHTML = `
      <div class="simple-page">
        <div class="page-header">
          <div>
            <div class="page-kicker">Panel preferences</div>
            <h1>Settings</h1>
            <p>Your account and the only panel options you need.</p>
          </div>
        </div>

        <div class="simple-settings-grid">
          <section class="simple-card">
            <h2>Account</h2>
            <p>The Discord account currently signed in.</p>
            <div id="simple-account-profile" class="simple-profile">
              <div class="simple-profile-fallback">A</div>
              <div class="simple-profile-copy"><strong>Loading account...</strong><span>Please wait</span></div>
            </div>
            <dl class="simple-info-list">
              <div><dt>Username</dt><dd id="simple-account-username">—</dd></div>
              <div><dt>Role</dt><dd id="simple-account-role">—</dd></div>
              <div><dt>Discord ID</dt><dd id="simple-account-id">—</dd></div>
            </dl>
          </section>

          <section class="simple-card">
            <h2>Appearance</h2>
            <p>Simple options. Changes apply after pressing Save.</p>
            <form id="simple-settings-form" class="simple-form">
              <div class="simple-field">
                <label for="simple-theme">Theme</label>
                <select id="simple-theme">
                  <option value="dark" ${theme === 'dark' ? 'selected' : ''}>Dark</option>
                  <option value="light" ${theme === 'light' ? 'selected' : ''}>Light</option>
                </select>
              </div>

              <label class="simple-check">
                <input id="simple-live-updates" type="checkbox" ${liveUpdates ? 'checked' : ''}>
                <span><strong>Live updates</strong><span>Refresh dashboard and active tickets automatically.</span></span>
              </label>

              <div class="simple-save-row">
                <button class="btn btn-primary" type="submit"><i data-lucide="save" size="15"></i> Save changes</button>
                <span id="simple-save-message" class="simple-save-message"></span>
              </div>
            </form>
          </section>
        </div>
      </div>
    `;

    document.getElementById('simple-settings-form')?.addEventListener('submit', saveSimpleSettings);
    renderIcons(view);
    loadSimpleAccount();
  }

  async function loadSimpleAccount() {
    try {
      const session = await requestJson('/api/auth/me');
      const user = session.user || {};
      const displayName = user.displayName || user.guildNickname || user.globalName || user.username || 'Administrator';
      const profile = document.getElementById('simple-account-profile');
      if (!profile) return;

      profile.innerHTML = `
        ${user.avatarUrl
          ? `<img class="simple-profile-avatar" src="${escapeHtml(user.avatarUrl)}" alt="">`
          : `<div class="simple-profile-fallback">${escapeHtml(initials(displayName))}</div>`}
        <div class="simple-profile-copy">
          <strong>${escapeHtml(displayName)}</strong>
          <span>${escapeHtml(user.roleName || 'Authorized Admin')}</span>
        </div>
      `;
      document.getElementById('simple-account-username').textContent = user.username || '—';
      document.getElementById('simple-account-role').textContent = user.roleName || 'Authorized Admin';
      document.getElementById('simple-account-id').textContent = user.id || '—';
    } catch (error) {
      const profile = document.getElementById('simple-account-profile');
      if (profile) profile.querySelector('strong').textContent = 'Unable to load account';
    }
  }

  function saveSimpleSettings(event) {
    event.preventDefault();

    const theme = document.getElementById('simple-theme')?.value === 'light' ? 'light' : 'dark';
    const autoRefresh = Boolean(document.getElementById('simple-live-updates')?.checked);
    const saved = currentSavedSettings();
    const next = {
      ...saved,
      theme,
      autoRefresh,
      glass: false,
      glow: false,
    };

    localStorage.setItem(UI_STORAGE_KEY, JSON.stringify(next));
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.themePreference = theme;

    try {
      if (typeof uiSettings !== 'undefined') {
        uiSettings.theme = theme;
        uiSettings.autoRefresh = autoRefresh;
      }
      if (typeof applyUISettings === 'function') {
        applyUISettings({ persist: true, restartTimers: true });
      } else if (typeof restartRefreshTimers === 'function') {
        restartRefreshTimers();
      }
    } catch (_) {}

    const message = document.getElementById('simple-save-message');
    if (message) {
      message.textContent = 'Saved.';
      window.setTimeout(() => { message.textContent = ''; }, 2200);
    }
    toast('Settings saved.');
  }

  function installTranscriptMetadataToggle() {
    const panel = document.getElementById('transcript-meta-panel');
    if (!panel || panel.classList.contains('simple-meta-panel')) return;

    panel.classList.add('simple-meta-panel');
    const heading = panel.querySelector('.transcript-meta-heading');
    if (!heading) return;

    const oldIcon = heading.querySelector('svg, i');
    oldIcon?.remove();

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'simple-meta-toggle';
    button.setAttribute('aria-label', 'Expand or collapse ticket metadata');
    button.innerHTML = '<i data-lucide="chevron-up" size="16"></i>';

    const toggle = () => {
      const collapsed = panel.classList.toggle('is-collapsed');
      button.setAttribute('aria-expanded', String(!collapsed));
      try { sessionStorage.setItem('5A_TRANSCRIPT_METADATA_COLLAPSED', collapsed ? '1' : '0'); } catch (_) {}
    };

    button.addEventListener('click', (event) => {
      event.stopPropagation();
      toggle();
    });
    heading.addEventListener('click', toggle);
    heading.appendChild(button);

    try {
      if (sessionStorage.getItem('5A_TRANSCRIPT_METADATA_COLLAPSED') === '1') {
        panel.classList.add('is-collapsed');
        button.setAttribute('aria-expanded', 'false');
      } else {
        button.setAttribute('aria-expanded', 'true');
      }
    } catch (_) {}

    renderIcons(panel);
  }

  function bindNavigationRefreshes() {
    document.querySelector('.nav-item[data-target="view-access-logs"]')?.addEventListener('click', () => {
      window.setTimeout(() => {
        if (!accessLoaded) loadSimpleAccessLogs();
      }, 0);
    });

    document.querySelector('.nav-item[data-target="view-settings"]')?.addEventListener('click', () => {
      window.setTimeout(loadSimpleAccount, 0);
    });

    document.querySelector('.nav-item[data-target="view-transcripts"]')?.addEventListener('click', () => {
      window.setTimeout(installTranscriptMetadataToggle, 0);
    });
  }

  function init() {
    installStyles();
    renderImportCenter();
    renderAccessLogs();
    renderSettings();
    installTranscriptMetadataToggle();
    bindNavigationRefreshes();

    // Ensure older global navigation handlers use the simplified loader.
    window.loadAccessLogs = loadSimpleAccessLogs;

    const transcriptView = document.getElementById('view-transcripts');
    if (transcriptView) {
      new MutationObserver(installTranscriptMetadataToggle).observe(transcriptView, {
        childList: true,
        subtree: true,
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
