'use strict';

(() => {
  // Helpers
  function escapeHTML(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function cleanValue(value, fallback = 'Not recorded') {
    const text = String(value ?? '').trim();
    if (!text || ['NONE', 'NULL', 'N/A', 'UNKNOWN'].includes(text.toUpperCase())) {
      return fallback;
    }
    return text;
  }

  function getDiscordIds(value) {
    const ids = [];
    const text = String(value || '');

    for (const match of text.matchAll(/<@!?(\d{15,22})>|(?<!\d)(\d{15,22})(?!\d)/g)) {
      const id = match[1] || match[2];
      if (id && !ids.includes(id)) ids.push(id);
    }

    return ids;
  }

  function getProfile(people, id) {
    return people?.[String(id)] || {};
  }

  function getAvatar(profile, id) {
    if (profile?.globalAvatarUrl || profile?.avatarUrl) {
      return profile.globalAvatarUrl || profile.avatarUrl;
    }

    try {
      const index = Number((BigInt(id) >> 22n) % 6n);
      return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
    } catch (_) {
      return 'https://cdn.discordapp.com/embed/avatars/0.png';
    }
  }

  function formatDate(value) {
    if (!value) return 'Not recorded';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Not recorded';
    return date.toLocaleString();
  }

  function getAccountAge(createdAt, fallback) {
    const created = new Date(createdAt);
    if (Number.isNaN(created.getTime())) return cleanValue(fallback, 'Unknown');

    const now = new Date();
    let years = now.getFullYear() - created.getFullYear();
    let months = now.getMonth() - created.getMonth();

    if (now.getDate() < created.getDate()) months -= 1;
    if (months < 0) {
      years -= 1;
      months += 12;
    }

    if (years > 0) {
      return `${years} year${years === 1 ? '' : 's'}, ${months} month${months === 1 ? '' : 's'}`;
    }
    if (months > 0) return `${months} month${months === 1 ? '' : 's'}`;

    const days = Math.max(0, Math.floor((Date.now() - created.getTime()) / 86400000));
    return `${days} day${days === 1 ? '' : 's'}`;
  }

  function getStatus(status) {
    const value = String(status || '').toLowerCase();

    if (value === 'whitelisted') {
      return { className: 'approved', icon: 'badge-check', text: 'Whitelisted' };
    }
    if (value === 'denied') {
      return { className: 'denied', icon: 'circle-x', text: 'Denied' };
    }
    return { className: 'pending', icon: 'clock-3', text: 'Pending' };
  }

  function formatType(value) {
    const text = cleanValue(value, 'Unknown').replaceAll('_', ' ');
    return text.replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  // Styles
  function addStyles() {
    if (document.getElementById('simple-whitelist-check-style')) return;

    const style = document.createElement('style');
    style.id = 'simple-whitelist-check-style';
    style.textContent = `
      #view-whitelist-check .whitelist-page-shell{max-width:1020px}
      #view-whitelist-check .whitelist-lookup-card{overflow:hidden}
      #view-whitelist-check .whitelist-help{display:none!important}

      .check-user-result{margin-top:18px;border-top:1px solid var(--border);padding-top:18px}
      .check-user-header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-bottom:16px;border-bottom:1px solid var(--border)}
      .check-user-profile{display:flex;align-items:center;gap:12px;min-width:0;padding:6px 8px;margin:-7px -9px;border:1px solid transparent;border-radius:9px;background:none;color:var(--text-main);cursor:pointer;text-align:left;transition:border-color .15s ease,background .15s ease}
      .check-user-profile:hover{border-color:var(--border-light);background:rgba(255,255,255,.025)}
      html[data-theme="light"] .check-user-profile:hover{background:rgba(15,23,42,.025)}
      .check-user-profile:focus-visible{outline:2px solid var(--primary);outline-offset:2px;border-color:var(--border-light)}
      .check-user-avatar{width:50px;height:50px;border-radius:50%;object-fit:cover;border:1px solid var(--border)}
      .check-user-name{min-width:0}
      .check-user-name small{display:block;color:var(--text-sec);font-size:9px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:3px}
      .check-user-name strong{display:block;font-size:17px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .check-user-name span{display:block;color:var(--text-sec);font-size:10px;margin-top:3px;word-break:break-all}

      .check-status{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:20px;font-size:10px;font-weight:700;border:1px solid var(--border);white-space:nowrap}
      .check-status.approved{color:#22c55e;border-color:rgba(34,197,94,.3);background:rgba(34,197,94,.08)}
      .check-status.pending{color:#f59e0b;border-color:rgba(245,158,11,.3);background:rgba(245,158,11,.08)}
      .check-status.denied{color:#ef4444;border-color:rgba(239,68,68,.3);background:rgba(239,68,68,.08)}

      .check-detail-list{margin-top:8px}
      .check-detail-row{display:grid;grid-template-columns:150px minmax(0,1fr);gap:18px;padding:12px 4px;border-bottom:1px solid var(--border);align-items:start}
      .check-detail-row:last-child{border-bottom:0}
      .check-detail-row>span{color:var(--text-sec);font-size:10px}
      .check-detail-row>strong,.check-detail-row>a{color:var(--text-main);font-size:11px;text-decoration:none;overflow-wrap:anywhere}
      .check-detail-row>a{color:var(--primary);width:max-content;max-width:100%}
      .check-detail-row>a:hover{text-decoration:underline}

      .check-person-list{display:flex;flex-wrap:wrap;gap:7px}
      .check-person{display:flex;align-items:center;gap:7px;padding:6px 8px;border:1px solid var(--border);border-radius:8px;background:var(--bg-main);color:var(--text-main);cursor:pointer;text-align:left}
      .check-person:hover{border-color:var(--border-light)}
      .check-person img{width:27px;height:27px;border-radius:50%;object-fit:cover}
      .check-person div{min-width:0}
      .check-person strong{display:block;font-size:10px;max-width:190px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .check-person small{display:block;color:var(--text-sec);font-size:8px;margin-top:2px}
      .check-empty{color:var(--text-sec);font-size:10px}

      .check-section-title{margin-top:18px;padding-bottom:7px;border-bottom:1px solid var(--border);color:var(--text-sec);font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em}

      @media(max-width:650px){
        .check-user-header{align-items:flex-start;flex-direction:column}
        .check-detail-row{grid-template-columns:1fr;gap:5px;padding:11px 2px}
      }
    `;

    document.head.appendChild(style);
  }

  function personHTML(id, people) {
    const profile = getProfile(people, id);
    const name = cleanValue(profile.globalName, cleanValue(profile.username, 'Discord user'));
    const username = cleanValue(profile.username, 'Unknown username');
    const avatar = getAvatar(profile, id);

    return `
      <button type="button" class="check-person" onclick="window.openWhitelistDiscordProfile?.('${escapeHTML(id)}',{refresh:true})">
        <img src="${escapeHTML(avatar)}" alt="${escapeHTML(name)} avatar">
        <div>
          <strong>${escapeHTML(name)}</strong>
          <small>@${escapeHTML(username)} · ${escapeHTML(id)}</small>
        </div>
      </button>`;
  }

  function peopleHTML(value, people, emptyText) {
    const ids = getDiscordIds(value);
    if (ids.length) {
      return `<div class="check-person-list">${ids.map((id) => personHTML(id, people)).join('')}</div>`;
    }

    const text = cleanValue(value, '');
    if (text) return `<strong>${escapeHTML(text)}</strong>`;
    return `<div class="check-empty">${escapeHTML(emptyText)}</div>`;
  }

  function hasValue(value) {
    return cleanValue(value, '') !== '';
  }

  // Result
  function renderResult(record, people) {
    const id = String(record?.discordId || '').trim();
    const profile = getProfile(people, id);
    const name = cleanValue(profile.globalName, cleanValue(profile.username, 'Discord user'));
    const username = cleanValue(profile.username, 'Unknown username');
    const avatar = getAvatar(profile, id);
    const status = getStatus(record?.status);
    const steam = String(record?.steamProfile || '').trim();
    const accountAge = getAccountAge(profile?.accountCreatedAt, record?.accountAge);
    const accountCreated = profile?.accountCreatedAt ? formatDate(profile.accountCreatedAt) : 'Not available';
    const memberStatus = profile?.inGuild === true
      ? 'In the 5th Avenue server'
      : profile?.inGuild === false
        ? 'Not in the 5th Avenue server'
        : 'Not available';
    const showRevokedVouches = hasValue(record?.revokedVouches);

    return `
      <div class="check-user-result">
        <div class="check-user-header">
          <button type="button" class="check-user-profile" onclick="window.openWhitelistDiscordProfile?.('${escapeHTML(id)}',{refresh:true})" title="Open Discord profile">
            <img class="check-user-avatar" src="${escapeHTML(avatar)}" alt="${escapeHTML(name)} avatar">
            <span class="check-user-name">
              <small>Discord User</small>
              <strong>${escapeHTML(name)}</strong>
              <span>@${escapeHTML(username)} · ${escapeHTML(id)}</span>
            </span>
          </button>

          <span class="check-status ${status.className}">
            <i data-lucide="${status.icon}" size="13"></i>${status.text}
          </span>
        </div>

        <div class="check-section-title">Application</div>
        <div class="check-detail-list">
          <div class="check-detail-row">
            <span>Character Name</span>
            <strong>${escapeHTML(cleanValue(record?.characterName, 'Not recorded'))}</strong>
          </div>
          <div class="check-detail-row">
            <span>Whitelist Type</span>
            <strong>${escapeHTML(formatType(record?.whitelistType))}</strong>
          </div>
          <div class="check-detail-row">
            <span>Submitted</span>
            <strong>${escapeHTML(formatDate(record?.createdAt))}</strong>
          </div>
          <div class="check-detail-row">
            <span>Account Age</span>
            <strong>${escapeHTML(accountAge)}</strong>
          </div>
          <div class="check-detail-row">
            <span>Discord Account Created</span>
            <strong>${escapeHTML(accountCreated)}</strong>
          </div>
          <div class="check-detail-row">
            <span>Server Status</span>
            <strong>${escapeHTML(memberStatus)}</strong>
          </div>
          ${/^https?:\/\//i.test(steam) ? `
          <div class="check-detail-row">
            <span>Steam Profile</span>
            <a href="${escapeHTML(steam)}" target="_blank" rel="noopener noreferrer">Open Steam Profile</a>
          </div>` : ''}
        </div>

        <div class="check-section-title">Voucher Details</div>
        <div class="check-detail-list">
          <div class="check-detail-row">
            <span>Vouchers</span>
            ${peopleHTML(record?.vouchers, people, 'No vouchers recorded')}
          </div>
          <div class="check-detail-row">
            <span>Whitelisted By</span>
            ${peopleHTML(record?.whitelistedBy, people, status.text === 'Whitelisted' ? 'Not recorded' : 'Not approved yet')}
          </div>
          <div class="check-detail-row">
            <span>Interviewer</span>
            ${peopleHTML(record?.interviewer, people, 'No interviewer recorded')}
          </div>
          ${showRevokedVouches ? `
          <div class="check-detail-row">
            <span>Revoked Vouches</span>
            ${peopleHTML(record?.revokedVouches, people, 'No revoked vouches')}
          </div>` : ''}
        </div>
      </div>`;
  }

  // Lookup
  async function checkUser() {
    const input = document.getElementById('whitelist-check-input');
    const button = document.getElementById('whitelist-check-button');
    const result = document.getElementById('whitelist-check-result');
    const id = String(input?.value || '').trim();

    if (!/^\d{15,22}$/.test(id)) {
      window.showToast?.('Enter a valid Discord User ID.', 'error');
      input?.focus();
      return;
    }

    button.disabled = true;
    result.innerHTML = '<div class="whitelist-result-empty"><i data-lucide="loader-circle"></i><strong>Checking user...</strong></div>';
    window.renderPanelIcons?.({ root: result, immediate: true });

    try {
      const response = await fetch(`/api/whitelist/lookup?discordId=${encodeURIComponent(id)}&refreshProfiles=1`);
      const data = await response.json().catch(() => ({}));

      if (response.status === 404) {
        result.innerHTML = '<div class="whitelist-result-empty"><i data-lucide="user-x"></i><strong>No whitelist record found</strong><span>This Discord User ID is not in the whitelist database.</span></div>';
        return;
      }

      if (!response.ok) throw new Error(data.error || 'Unable to check this user.');

      result.innerHTML = renderResult(data.record || {}, data.people || {});
      if (data.profileWarning) window.showToast?.(data.profileWarning, 'info');
    } catch (error) {
      result.innerHTML = `<div class="whitelist-result-empty"><i data-lucide="triangle-alert"></i><strong>Something went wrong</strong><span>${escapeHTML(error.message || 'Unable to load this user.')}</span></div>`;
      window.showToast?.(error.message || 'Whitelist lookup failed.', 'error');
    } finally {
      button.disabled = false;
      window.renderPanelIcons?.({ root: result, immediate: true });
    }
  }

  function setup() {
    addStyles();
    window.checkWhitelistVoucher = checkUser;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup, { once: true });
  } else {
    setup();
  }
})();