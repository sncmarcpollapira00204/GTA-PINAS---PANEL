'use strict';

(() => {
  const VIEW_ID = 'view-manage-staff';
  let payload = { staff: [], summary: {} };
  let loading = false;
  let managementAccessEnabled = false;
  let searchTerm = '';

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function isManagementEnabled() {
    return managementAccessEnabled === true;
  }

  function csrfToken() {
    return typeof panelCsrfToken === 'string' ? panelCsrfToken : '';
  }

  function toast(message, type = 'info') {
    if (typeof window.showToast === 'function') return window.showToast(message, type);
    console[type === 'error' ? 'error' : 'log'](`[Manage Staff] ${message}`);
  }

  function formatDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString([], {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  function displayName(item) {
    return String(item?.displayName || item?.username || item?.discordId || 'Staff member');
  }

  function findStaff(discordId) {
    return (Array.isArray(payload.staff) ? payload.staff : [])
      .find((item) => String(item.discordId) === String(discordId));
  }

  async function resolveManagementAccess() {
    try {
      if (typeof panelAuthSession !== 'undefined' && panelAuthSession?.permissions?.staffManagement === true) {
        managementAccessEnabled = true;
        return true;
      }
    } catch (_) {}

    try {
      const response = await fetch('/api/auth/me', {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      if (!response.ok) return false;
      const data = await response.json().catch(() => ({}));
      managementAccessEnabled = data?.permissions?.staffManagement === true;
      return managementAccessEnabled;
    } catch (_) {
      managementAccessEnabled = false;
      return false;
    }
  }

  function injectStyles() {
    if (document.getElementById('manage-staff-styles')) return;
    const style = document.createElement('style');
    style.id = 'manage-staff-styles';
    style.textContent = `
      #${VIEW_ID}{max-width:1180px}
      #${VIEW_ID} .page-header{align-items:center;margin-bottom:20px}
      #${VIEW_ID} .page-header p{max-width:680px}
      #${VIEW_ID} .panel-access-note{display:flex;align-items:flex-start;gap:12px;padding:14px 16px;margin-bottom:16px;border:1px solid color-mix(in srgb,var(--primary) 28%,var(--border));background:color-mix(in srgb,var(--primary) 7%,var(--bg-card));border-radius:12px}
      #${VIEW_ID} .panel-access-note-icon{width:32px;height:32px;display:grid;place-items:center;flex:0 0 auto;border-radius:9px;background:color-mix(in srgb,var(--primary) 12%,var(--bg-main));color:var(--primary)}
      #${VIEW_ID} .panel-access-note strong{display:block;font-size:12px;margin-bottom:4px;color:var(--text-main)}
      #${VIEW_ID} .panel-access-note span{display:block;color:var(--text-sec);font-size:11px;line-height:1.55}
      #${VIEW_ID} .panel-access-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:16px}
      #${VIEW_ID} .panel-access-stat{padding:15px 16px;background:var(--bg-card);border:1px solid var(--border);border-radius:12px}
      #${VIEW_ID} .panel-access-stat span{display:block;color:var(--text-sec);font-size:10px;font-weight:700}
      #${VIEW_ID} .panel-access-stat strong{display:block;margin-top:5px;font-size:23px;line-height:1;color:var(--text-main)}
      #${VIEW_ID} .panel-access-stat small{display:block;margin-top:6px;color:var(--text-sec);font-size:9px;line-height:1.4}
      #${VIEW_ID} .panel-access-card{background:var(--bg-card);border:1px solid var(--border);border-radius:14px;padding:18px}
      #${VIEW_ID} .panel-access-toolbar{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:14px}
      #${VIEW_ID} .panel-access-toolbar-copy h3{margin:0 0 4px;font-size:15px}
      #${VIEW_ID} .panel-access-toolbar-copy p{margin:0;color:var(--text-sec);font-size:11px;line-height:1.5}
      #${VIEW_ID} .panel-access-search-wrap{width:min(330px,100%);position:relative;flex:0 0 auto}
      #${VIEW_ID} .panel-access-search-wrap svg{position:absolute;left:11px;top:50%;transform:translateY(-50%);color:var(--text-sec);pointer-events:none}
      #${VIEW_ID} .panel-access-search{width:100%;height:39px;border:1px solid var(--border);background:var(--bg-main);color:var(--text-main);border-radius:9px;padding:0 11px 0 34px;outline:none;font-size:11px}
      #${VIEW_ID} .panel-access-search::placeholder{color:var(--text-sec)}
      #${VIEW_ID} .panel-access-search:focus{border-color:var(--primary);box-shadow:0 0 0 2px color-mix(in srgb,var(--primary) 12%,transparent)}
      #${VIEW_ID} .panel-access-list{display:flex;flex-direction:column;gap:9px}
      #${VIEW_ID} .panel-access-row{display:flex;align-items:center;gap:13px;padding:13px 14px;border:1px solid var(--border);background:var(--bg-main);border-radius:11px;transition:border-color .16s ease,background .16s ease,transform .16s ease}
      #${VIEW_ID} .panel-access-row:hover{border-color:var(--border-light);background:var(--bg-card-hover);transform:translateY(-1px)}
      #${VIEW_ID} .panel-access-row.removed{opacity:.78}
      #${VIEW_ID} .panel-access-avatar{width:46px;height:46px;border-radius:50%;object-fit:cover;background:var(--bg-card-hover);border:1px solid var(--border);flex:0 0 auto;display:grid;place-items:center;font-size:13px;font-weight:800;color:var(--text-main)}
      #${VIEW_ID} .panel-access-person{min-width:0;flex:1}
      #${VIEW_ID} .panel-access-person strong{display:block;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text-main)}
      #${VIEW_ID} .panel-access-person small{display:block;color:var(--text-sec);font-size:10px;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      #${VIEW_ID} .panel-access-removed-detail{color:#f59e0b!important}
      #${VIEW_ID} .panel-access-roles{display:flex;gap:5px;flex-wrap:wrap;margin-top:7px}
      #${VIEW_ID} .panel-access-role{font-size:9px;padding:4px 7px;border:1px solid var(--border);border-radius:999px;color:var(--text-sec);background:var(--bg-card)}
      #${VIEW_ID} .panel-access-role.protected{color:#93c5fd;border-color:rgba(59,130,246,.24);background:rgba(59,130,246,.08)}
      #${VIEW_ID} .panel-access-status{display:inline-flex;align-items:center;gap:6px;font-size:10px;font-weight:700;padding:6px 9px;border-radius:999px;white-space:nowrap}
      #${VIEW_ID} .panel-access-status::before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor}
      #${VIEW_ID} .panel-access-status.active{color:#22c55e;background:rgba(34,197,94,.09);border:1px solid rgba(34,197,94,.20)}
      #${VIEW_ID} .panel-access-status.removed{color:#ef4444;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.18)}
      #${VIEW_ID} .panel-access-actions{flex:0 0 auto;min-width:118px;display:flex;justify-content:flex-end}
      #${VIEW_ID} .panel-access-actions .btn{font-size:10px;padding:8px 10px;white-space:nowrap}
      #${VIEW_ID} .panel-access-empty{padding:34px 20px;text-align:center;color:var(--text-sec);font-size:11px;line-height:1.55;border:1px dashed var(--border);border-radius:11px;background:color-mix(in srgb,var(--bg-main) 72%,transparent)}
      #${VIEW_ID} .panel-access-empty strong{display:block;color:var(--text-main);font-size:12px;margin-bottom:4px}
      @media(max-width:820px){#${VIEW_ID} .panel-access-toolbar{align-items:stretch;flex-direction:column}#${VIEW_ID} .panel-access-search-wrap{width:100%}}
      @media(max-width:760px){#${VIEW_ID} .panel-access-summary{grid-template-columns:1fr}#${VIEW_ID} .panel-access-row{align-items:flex-start;flex-wrap:wrap}#${VIEW_ID} .panel-access-status{margin-left:59px}#${VIEW_ID} .panel-access-actions{width:100%;margin-left:59px;justify-content:flex-start}#${VIEW_ID} .panel-access-actions .btn{width:100%;max-width:220px}}
      @media(max-width:480px){#${VIEW_ID} .panel-access-status,#${VIEW_ID} .panel-access-actions{margin-left:0}}
    `;
    document.head.appendChild(style);
  }

  function createView() {
    if (document.getElementById(VIEW_ID)) return;
    const content = document.querySelector('.content-area');
    if (!content) return;

    const section = document.createElement('section');
    section.id = VIEW_ID;
    section.className = 'view-section';
    section.dataset.staffManagementOnly = '';
    section.hidden = !isManagementEnabled();
    section.innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-kicker">Staff access</div>
          <h1>Manage Staff</h1>
          <p>See who can sign in to the Web Panel and remove access when someone no longer needs it.</p>
        </div>
        <button class="btn btn-outline" type="button" id="manage-staff-refresh"><i data-lucide="refresh-cw" size="15"></i>Refresh list</button>
      </div>

      <div class="panel-access-note">
        <div class="panel-access-note-icon"><i data-lucide="shield-check" size="17"></i></div>
        <div>
          <strong>Discord roles stay untouched</strong>
          <span>This page only controls Web Panel sign-in. Removing access signs the person out of the panel and blocks future panel logins, but it will not change any of their Discord roles.</span>
        </div>
      </div>

      <div class="panel-access-summary">
        <div class="panel-access-stat"><span>People listed</span><strong id="panel-access-total">0</strong><small>Staff accounts eligible for panel access</small></div>
        <div class="panel-access-stat"><span>Can sign in</span><strong id="panel-access-active">0</strong><small>Currently allowed into the Web Panel</small></div>
        <div class="panel-access-stat"><span>Access removed</span><strong id="panel-access-removed">0</strong><small>Blocked from signing in to the panel</small></div>
      </div>

      <div class="panel-access-card">
        <div class="panel-access-toolbar">
          <div class="panel-access-toolbar-copy">
            <h3>Who can access the panel</h3>
            <p>Search by name, Discord ID, or role. Protected owner access cannot be removed here.</p>
          </div>
          <label class="panel-access-search-wrap" aria-label="Search staff">
            <i data-lucide="search" size="15"></i>
            <input id="panel-access-search" class="panel-access-search" type="search" autocomplete="off" placeholder="Find a staff member...">
          </label>
        </div>
        <div id="manage-staff-list" class="panel-access-list" aria-live="polite">
          <div class="panel-access-empty"><strong>Getting the staff list...</strong>This should only take a moment.</div>
        </div>
      </div>
    `;
    content.appendChild(section);

    document.getElementById('manage-staff-refresh')?.addEventListener('click', () => window.loadManagedStaff({ force: true }));
    document.getElementById('panel-access-search')?.addEventListener('input', (event) => {
      searchTerm = String(event.target.value || '').trim().toLowerCase();
      renderList();
    });
  }

  function activateView() {
    if (!isManagementEnabled()) return;
    document.querySelectorAll('.view-section').forEach((section) => section.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach((item) => item.classList.remove('active'));
    const view = document.getElementById(VIEW_ID);
    if (view) {
      view.hidden = false;
      view.classList.add('active');
    }
    document.getElementById('nav-manage-staff')?.classList.add('active');
    window.loadManagedStaff({ force: false });
    if (window.renderPanelIcons && view) window.renderPanelIcons({ root: view, immediate: true });
  }

  function createNavItem() {
    if (document.getElementById('nav-manage-staff')) return;
    const menu = document.querySelector('[data-nav-group="management"] .nav-dropdown-menu-inner');
    if (!menu) return;

    const link = document.createElement('a');
    link.id = 'nav-manage-staff';
    link.className = 'nav-item';
    link.title = 'Manage Staff';
    link.dataset.staffManagementOnly = '';
    link.hidden = !isManagementEnabled();
    link.innerHTML = '<i data-lucide="users" size="18"></i><span class="nav-label">Manage Staff</span>';
    link.addEventListener('click', (event) => {
      event.preventDefault();
      activateView();
    });

    const ownerSubsection = menu.querySelector('[data-owner-only].nav-subsection-label');
    if (ownerSubsection) ownerSubsection.insertAdjacentElement('beforebegin', link);
    else menu.appendChild(link);

    if (window.renderPanelIcons) window.renderPanelIcons({ root: link, immediate: true });
  }

  function avatarMarkup(item) {
    if (item.avatarUrl) {
      return `<img class="panel-access-avatar" src="${escapeHtml(item.avatarUrl)}" alt="${escapeHtml(displayName(item))}" loading="lazy">`;
    }
    return `<div class="panel-access-avatar" aria-hidden="true">${escapeHtml(displayName(item).slice(0, 1).toUpperCase())}</div>`;
  }

  function filteredStaff() {
    const staff = Array.isArray(payload.staff) ? payload.staff : [];
    if (!searchTerm) return staff;
    return staff.filter((item) => {
      const roles = Array.isArray(item.authorizedRoles) ? item.authorizedRoles.map((role) => role.name).join(' ') : '';
      return [item.displayName, item.username, item.discordId, roles]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(searchTerm);
    });
  }

  function renderSummary() {
    const summary = payload.summary || {};
    const values = {
      'panel-access-total': summary.totalEligible || 0,
      'panel-access-active': summary.activeAccess || 0,
      'panel-access-removed': summary.removedAccess || 0,
    };
    Object.entries(values).forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (element) element.textContent = String(value);
    });
  }

  function renderList() {
    renderSummary();
    const host = document.getElementById('manage-staff-list');
    if (!host) return;
    const staff = filteredStaff();

    if (!staff.length) {
      host.innerHTML = searchTerm
        ? '<div class="panel-access-empty"><strong>No staff member matched that search.</strong>Try a name, Discord ID, or role.</div>'
        : '<div class="panel-access-empty"><strong>No staff members are listed yet.</strong>There are currently no eligible Web Panel accounts to show.</div>';
      return;
    }

    host.innerHTML = staff.map((item) => {
      const removed = item.panelAccess === 'removed';
      const roles = Array.isArray(item.authorizedRoles) ? item.authorizedRoles : [];
      const roleMarkup = [
        ...roles.map((role) => `<span class="panel-access-role">${escapeHtml(role.name)}</span>`),
        ...(item.directUserAccess ? ['<span class="panel-access-role">Direct access</span>'] : []),
      ].join('');
      const removedDetail = removed && item.revokedAt
        ? `<small class="panel-access-removed-detail">Access removed ${escapeHtml(formatDate(item.revokedAt))}</small>`
        : '';
      const name = displayName(item);

      return `
        <div class="panel-access-row ${removed ? 'removed' : ''}">
          ${avatarMarkup(item)}
          <div class="panel-access-person">
            <strong>${escapeHtml(name)}</strong>
            <small>${item.username ? `@${escapeHtml(item.username)} · ` : ''}${escapeHtml(item.discordId)}</small>
            ${removedDetail}
            <div class="panel-access-roles">${roleMarkup || '<span class="panel-access-role">Panel staff</span>'}</div>
          </div>
          <span class="panel-access-status ${removed ? 'removed' : 'active'}">${removed ? 'No panel access' : 'Can sign in'}</span>
          <div class="panel-access-actions">
            ${item.protected
              ? '<span class="panel-access-role protected">Owner · protected</span>'
              : removed
                ? ''
                : `<button class="btn btn-danger" type="button" data-remove-panel-access="${escapeHtml(item.discordId)}" aria-label="Remove Web Panel access for ${escapeHtml(name)}"><i data-lucide="user-round-x" size="14"></i>Remove access</button>`}
          </div>
        </div>
      `;
    }).join('');

    host.querySelectorAll('[data-remove-panel-access]').forEach((button) => {
      button.addEventListener('click', () => window.removeManagedStaff(button.dataset.removePanelAccess));
    });

    if (window.renderPanelIcons) window.renderPanelIcons({ root: host, immediate: true });
  }

  async function request(url, options = {}) {
    const headers = { Accept: 'application/json', ...(options.headers || {}) };
    if (options.method && options.method !== 'GET') {
      headers['x-csrf-token'] = csrfToken();
    }
    const response = await fetch(url, { cache: 'no-store', ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
    return data;
  }

  window.loadManagedStaff = async function loadManagedStaff({ force = false } = {}) {
    if (!isManagementEnabled() || loading) return;
    if (!force && payload.staff?.length) return renderList();
    loading = true;

    const refreshButton = document.getElementById('manage-staff-refresh');
    if (refreshButton) refreshButton.disabled = true;

    try {
      payload = await request('/api/staff-management');
      renderList();
    } catch (error) {
      const host = document.getElementById('manage-staff-list');
      if (host) {
        host.innerHTML = `<div class="panel-access-empty"><strong>We couldn't load the staff list.</strong>${escapeHtml(error.message)}</div>`;
      }
      toast(`Couldn't load staff access: ${error.message}`, 'error');
    } finally {
      loading = false;
      if (refreshButton) refreshButton.disabled = false;
    }
  };

  window.removeManagedStaff = async function removeManagedStaff(discordId) {
    if (!isManagementEnabled()) return;
    const staff = findStaff(discordId);
    const name = displayName(staff);
    const confirmed = window.confirm(
      `Remove ${name}'s Web Panel access?\n\nThey'll be signed out of the panel and blocked from future panel logins. Their Discord roles will stay unchanged.`
    );
    if (!confirmed) return;

    try {
      const data = await request(`/api/staff-management/${encodeURIComponent(discordId)}`, { method: 'DELETE' });
      toast(data.message || `Web Panel access removed for ${name}.`, 'success');
      payload.staff = [];
      await window.loadManagedStaff({ force: true });
    } catch (error) {
      toast(`Couldn't remove access for ${name}: ${error.message}`, 'error');
    }
  };

  async function initialize() {
    if (!await resolveManagementAccess()) return;
    injectStyles();
    createView();
    createNavItem();
    if (window.renderPanelIcons) window.renderPanelIcons({ root: document.getElementById(VIEW_ID) || document, immediate: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
