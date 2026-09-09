'use strict';

(() => {
  const SLOT_ORDER = ['dashboard_banner', 'login_banner', 'login_music'];
  const ACTIVE_SECTION_KEY = '5thAvenueSettingsSection';
  const PUBLIC_MEDIA_TTL_MS = 30_000;
  const SLOT_COPY = {
    dashboard_banner: {
      title: 'Dashboard Banner',
      description: 'Change the dashboard background.',
      accept: '.png,.jpg,.jpeg,.webp,.gif,.webm',
    },
    login_banner: {
      title: 'Login Banner',
      description: 'Change the login background.',
      accept: '.png,.jpg,.jpeg,.webp,.gif,.webm',
    },
    login_music: {
      title: 'Login Music',
      description: 'Change the music on the login page.',
      accept: '.mp3,.ogg,.wav,.webm',
    },
  };

  let csrfToken = '';
  let settingsPayload = null;
  let busySlot = null;
  let settingsObserver = null;
  let settingsRequested = false;
  let settingsPromise = null;
  let publicMediaPayload = null;
  let publicMediaLoadedAt = 0;
  let publicMediaPromise = null;
  let dashboardVideo = null;
  let dashboardObserver = null;

  function showToast(message, type = 'success') {
    if (typeof window.showToast === 'function') {
      window.showToast(message, type);
      return;
    }
    console[type === 'error' ? 'error' : 'log'](message);
  }

  function renderIcons(root = document) {
    if (typeof window.renderPanelIcons === 'function') {
      window.renderPanelIcons({ root });
    } else if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  function formatBytes(value) {
    const bytes = Number(value || 0);
    if (!bytes) return 'Default file';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function cssUrl(url) {
    return `url("${String(url || '').replace(/["\\\n\r]/g, '\\$&')}")`;
  }

  function isViewActive(element) {
    return Boolean(element && element.classList.contains('active') && !element.hidden);
  }

  function shouldPlayDashboardVideo() {
    return !document.hidden && isViewActive(document.getElementById('view-dashboard'));
  }

  function syncDashboardPlayback() {
    if (!dashboardVideo) return;
    if (shouldPlayDashboardVideo()) {
      void dashboardVideo.play().catch(() => {});
    } else {
      dashboardVideo.pause();
    }
  }

  function watchDashboardVisibility(dashboard) {
    if (dashboardObserver || !dashboard) return;
    dashboardObserver = new MutationObserver(syncDashboardPlayback);
    dashboardObserver.observe(dashboard, {
      attributes: true,
      attributeFilter: ['class', 'hidden'],
    });
  }

  function releaseDashboardVideo() {
    if (!dashboardVideo) return;
    dashboardVideo.pause();
    dashboardVideo.removeAttribute('src');
    dashboardVideo.load();
    dashboardVideo.remove();
    dashboardVideo = null;
  }

  function applyDashboardMedia(asset) {
    const dashboard = document.getElementById('view-dashboard');
    if (!dashboard || !asset?.url) return;

    watchDashboardVisibility(dashboard);
    const resolvedUrl = new URL(asset.url, window.location.href).href;

    if (asset.kind === 'video') {
      if (dashboardVideo && dashboardVideo.src === resolvedUrl) {
        syncDashboardPlayback();
        return;
      }

      releaseDashboardVideo();
      const video = document.createElement('video');
      video.className = 'dashboard-dynamic-media';
      video.src = asset.url;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = 'metadata';
      video.disablePictureInPicture = true;
      video.setAttribute('aria-hidden', 'true');
      dashboard.prepend(video);
      dashboard.classList.add('dashboard-has-video-media');
      dashboardVideo = video;
      syncDashboardPlayback();
      return;
    }

    releaseDashboardVideo();
    dashboard.classList.remove('dashboard-has-video-media');
    dashboard.style.setProperty('--dashboard-media-image', cssUrl(asset.url));
  }

  function loadPublicMedia(options = {}) {
    const force = options.force === true;
    const now = Date.now();

    if (!force && publicMediaPayload && now - publicMediaLoadedAt < PUBLIC_MEDIA_TTL_MS) {
      return Promise.resolve(publicMediaPayload);
    }
    if (!force && publicMediaPromise) return publicMediaPromise;

    const request = fetch('/media/config', {
      cache: force ? 'reload' : 'default',
      credentials: 'same-origin',
    })
      .then((response) => {
        if (!response.ok) throw new Error(`Media config returned ${response.status}.`);
        return response.json();
      })
      .then((payload) => {
        publicMediaPayload = payload;
        publicMediaLoadedAt = Date.now();
        applyDashboardMedia(payload.slots?.dashboard_banner);
        return payload;
      })
      .catch((error) => {
        console.warn('[PANEL MEDIA]', error.message || error);
        return null;
      })
      .finally(() => {
        if (publicMediaPromise === request) publicMediaPromise = null;
      });

    publicMediaPromise = request;
    return request;
  }

  function updatePublicAsset(slot, asset) {
    if (!publicMediaPayload) publicMediaPayload = { slots: {} };
    if (!publicMediaPayload.slots) publicMediaPayload.slots = {};
    publicMediaPayload.slots[slot] = asset;
    publicMediaLoadedAt = Date.now();
    if (slot === 'dashboard_banner') applyDashboardMedia(asset);
  }

  function installStyles() {
    if (document.getElementById('media-branding-settings-styles')) return;

    const style = document.createElement('style');
    style.id = 'media-branding-settings-styles';
    style.textContent = `
      .simple-settings-switcher{width:min(100%,460px);display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:5px;border:1px solid var(--border);border-radius:10px;background:var(--bg-card)}
      .simple-settings-switcher button{min-height:40px;display:flex;align-items:center;justify-content:center;gap:8px;padding:8px 13px;border:1px solid transparent;border-radius:7px;background:transparent;color:var(--text-sec);font:inherit;font-size:10px;font-weight:700;cursor:pointer;transition:background .16s ease,border-color .16s ease,color .16s ease}
      .simple-settings-switcher button:hover{color:var(--text-main);background:var(--bg-main)}
      .simple-settings-switcher button.active{border-color:rgba(37,99,235,.55);background:rgba(37,99,235,.18);color:var(--text-main)}
      .simple-settings-pane{display:block;min-width:0}
      .simple-settings-pane[hidden]{display:none!important}
      #simple-user-settings-pane>.simple-settings-grid{width:100%}
      #simple-web-panel-settings-pane{width:100%}
      .media-settings-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
      .media-settings-card{display:flex;min-width:0;flex-direction:column;padding:16px;border:1px solid var(--border);border-radius:10px;background:var(--bg-card)}
      .media-settings-card h3{margin:0;font-size:14px}
      .media-settings-card>p{min-height:30px;margin:5px 0 12px;color:var(--text-sec);font-size:10px;line-height:1.5}
      .media-preview{position:relative;width:100%;height:150px;display:grid;place-items:center;overflow:hidden;border:1px solid var(--border);border-radius:10px;background:var(--bg-main)}
      .media-preview img,.media-preview video{width:100%;height:100%;display:block;object-fit:cover}
      .media-preview audio{width:calc(100% - 20px)}
      .media-preview-badge{position:absolute;top:8px;right:8px;padding:4px 7px;border:1px solid var(--border);border-radius:999px;background:rgba(5,10,20,.82);color:#fff;font-size:8px;font-weight:700;text-transform:uppercase}
      .media-file-meta{min-height:36px;margin:10px 0;color:var(--text-sec);font-size:9px;line-height:1.5;overflow-wrap:anywhere}
      .media-file-picker{width:100%;margin-bottom:10px;padding:9px;border:1px dashed var(--border);border-radius:8px;background:var(--bg-main);color:var(--text-sec);font-size:9px;box-sizing:border-box}
      .media-card-actions{display:grid;grid-template-columns:1fr auto;gap:8px;margin-top:auto}
      .media-card-actions .btn{min-height:38px;padding:8px 12px}
      .media-settings-note{display:flex;align-items:center;gap:9px;margin-top:14px;padding:11px 12px;border:1px solid rgba(88,101,242,.22);border-radius:9px;background:rgba(88,101,242,.07);color:var(--text-sec);font-size:10px;line-height:1.5}
      #simple-media-branding>h2{display:flex;align-items:center;gap:8px}
      #simple-media-branding>.media-settings-intro{margin-bottom:15px!important}
      .panel-settings-lock{min-height:240px;display:flex;align-items:center;justify-content:center;padding:28px;text-align:center}
      .panel-settings-lock-inner{max-width:480px}
      .panel-settings-lock-icon{width:50px;height:50px;display:grid;place-items:center;margin:0 auto 14px;border:1px solid rgba(88,101,242,.34);border-radius:14px;background:rgba(88,101,242,.10);color:var(--primary)}
      .panel-settings-lock h2{margin:0;font-size:17px}
      .panel-settings-lock p{margin:8px auto 0;color:var(--text-sec);font-size:11px;line-height:1.6}
      @media(max-width:1100px){.media-settings-grid{grid-template-columns:1fr 1fr}}
      @media(max-width:720px){.simple-settings-switcher{width:100%}.media-settings-grid{grid-template-columns:1fr}.media-preview{height:180px}.media-card-actions{grid-template-columns:1fr}.media-card-actions .btn{width:100%}}
      @media(prefers-reduced-motion:reduce){.simple-settings-switcher button{transition:none}}
    `;
    document.head.appendChild(style);
  }

  function isPanelSettingsVisible() {
    const settingsView = document.getElementById('view-settings');
    const panelPane = document.getElementById('simple-web-panel-settings-pane');
    return !document.hidden && isViewActive(settingsView) && Boolean(panelPane && !panelPane.hidden);
  }

  function syncPreviewPlayback() {
    const panelPane = document.getElementById('simple-web-panel-settings-pane');
    if (!panelPane) return;
    const visible = isPanelSettingsVisible();

    panelPane.querySelectorAll('video.media-preview-player').forEach((video) => {
      if (visible) void video.play().catch(() => {});
      else video.pause();
    });

    if (!visible) {
      panelPane.querySelectorAll('audio').forEach((audio) => audio.pause());
    }
  }

  function createPreview(asset) {
    const preview = document.createElement('div');
    preview.className = 'media-preview';

    let media;
    if (asset.kind === 'video') {
      media = document.createElement('video');
      media.className = 'media-preview-player';
      media.src = asset.url;
      media.muted = true;
      media.loop = true;
      media.playsInline = true;
      media.preload = 'metadata';
      media.disablePictureInPicture = true;
    } else if (asset.kind === 'audio') {
      media = document.createElement('audio');
      media.src = asset.url;
      media.controls = true;
      media.preload = 'none';
    } else {
      media = document.createElement('img');
      media.src = asset.url;
      media.alt = '';
      media.loading = 'lazy';
      media.decoding = 'async';
    }

    preview.appendChild(media);

    const badge = document.createElement('span');
    badge.className = 'media-preview-badge';
    badge.textContent = asset.isDefault ? 'Default' : asset.kind;
    preview.appendChild(badge);
    return preview;
  }

  function createMediaCard(slot, asset) {
    const copy = SLOT_COPY[slot];
    const card = document.createElement('article');
    card.className = 'media-settings-card';
    card.dataset.mediaSlot = slot;

    const title = document.createElement('h3');
    title.textContent = copy.title;
    const description = document.createElement('p');
    description.textContent = copy.description;
    card.append(title, description, createPreview(asset));

    const meta = document.createElement('div');
    meta.className = 'media-file-meta';
    const name = document.createElement('strong');
    name.style.color = 'var(--text-main)';
    name.textContent = asset.isDefault ? 'Using the default file' : (asset.originalName || 'Custom file');
    const details = document.createElement('div');
    details.textContent = `${formatBytes(asset.sizeBytes)} · Max ${(Number(asset.maxBytes) / 1024 / 1024).toFixed(0)} MB`;
    meta.append(name, details);
    card.appendChild(meta);

    const input = document.createElement('input');
    input.className = 'media-file-picker';
    input.type = 'file';
    input.accept = copy.accept;
    input.setAttribute('aria-label', `Choose ${copy.title}`);
    card.appendChild(input);

    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;
      if (file.size > Number(asset.maxBytes)) {
        showToast(`${copy.title} is too large.`, 'error');
        input.value = '';
        return;
      }
      name.textContent = file.name;
      details.textContent = `${formatBytes(file.size)} selected`;
    });

    const actions = document.createElement('div');
    actions.className = 'media-card-actions';

    const upload = document.createElement('button');
    upload.type = 'button';
    upload.className = 'btn btn-primary';
    upload.innerHTML = '<i data-lucide="upload" size="15"></i> Upload';
    upload.disabled = Boolean(busySlot);
    upload.addEventListener('click', () => uploadSlot(slot, input));

    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'btn btn-outline';
    reset.textContent = 'Reset';
    reset.disabled = asset.isDefault || Boolean(busySlot);
    reset.addEventListener('click', () => resetSlot(slot));

    actions.append(upload, reset);
    card.appendChild(actions);
    return card;
  }

  function panelRenderKey() {
    const slots = settingsPayload?.slots || {};
    const mediaKey = SLOT_ORDER.map((slot) => slots[slot]?.url || slot).join('|');
    return `${settingsPayload?.canManage ? 'manager' : 'locked'}|${busySlot || ''}|${mediaKey}`;
  }

  function renderManagerPanel(panelPane, force = false) {
    const renderKey = panelRenderKey();
    if (!force && panelPane.dataset.renderKey === renderKey) {
      syncPreviewPlayback();
      return;
    }

    panelPane.dataset.renderKey = renderKey;
    panelPane.innerHTML = `
      <section id="simple-media-branding" class="simple-card">
        <h2><i data-lucide="image-up" size="17"></i> Panel Design &amp; Music</h2>
        <p class="media-settings-intro">Change the panel banner, login background, or login music.</p>
        <div class="media-settings-grid"></div>
        <div class="media-settings-note">
          <i data-lucide="save" size="16"></i>
          <span>Your uploaded files are saved automatically.</span>
        </div>
      </section>
    `;

    const grid = panelPane.querySelector('.media-settings-grid');
    if (grid && settingsPayload?.slots) {
      grid.replaceChildren(...SLOT_ORDER.map((slot) => createMediaCard(slot, settingsPayload.slots[slot])));
    }
    renderIcons(panelPane);
    syncPreviewPlayback();
  }

  function renderLockedPanel(panelPane) {
    const renderKey = panelRenderKey();
    if (panelPane.dataset.renderKey === renderKey) return;
    panelPane.dataset.renderKey = renderKey;
    panelPane.innerHTML = `
      <section class="simple-card panel-settings-lock">
        <div class="panel-settings-lock-inner">
          <div class="panel-settings-lock-icon"><i data-lucide="lock-keyhole" size="24"></i></div>
          <h2>Web Panel Settings are locked</h2>
          <p>Only the Panel Owner, Owner, and Executives can change the panel design and music.</p>
        </div>
      </section>
    `;
    renderIcons(panelPane);
  }

  function renderPanelSettingsPane(panelPane, force = false) {
    if (!settingsPayload || !panelPane) return;
    if (settingsPayload.canManage) renderManagerPanel(panelPane, force);
    else renderLockedPanel(panelPane);
  }

  function savedActiveSection() {
    try {
      return sessionStorage.getItem(ACTIVE_SECTION_KEY) === 'panel' ? 'panel' : 'user';
    } catch (_) {
      return 'user';
    }
  }

  function activateSimpleSection(section) {
    const normalized = section === 'panel' ? 'panel' : 'user';
    const switcher = document.getElementById('simple-settings-switcher');
    const userPane = document.getElementById('simple-user-settings-pane');
    const panelPane = document.getElementById('simple-web-panel-settings-pane');
    if (!switcher || !userPane || !panelPane) return;

    switcher.querySelectorAll('[data-simple-settings-section]').forEach((button) => {
      const active = button.dataset.simpleSettingsSection === normalized;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
    });

    userPane.hidden = normalized !== 'user';
    panelPane.hidden = normalized !== 'panel';

    try {
      sessionStorage.setItem(ACTIVE_SECTION_KEY, normalized);
    } catch (_) {}

    if (normalized === 'panel') renderPanelSettingsPane(panelPane);
    window.requestAnimationFrame(syncPreviewPlayback);
  }

  function installSimpleSettingsView() {
    const settingsView = document.getElementById('view-settings');
    const simplePage = settingsView?.querySelector('.simple-page');
    const settingsGrid = simplePage?.querySelector('.simple-settings-grid');
    const pageHeader = simplePage?.querySelector(':scope > .page-header');
    if (!simplePage || !settingsGrid || !pageHeader || !settingsPayload) return false;

    let switcher = simplePage.querySelector('#simple-settings-switcher');
    if (!switcher) {
      switcher = document.createElement('div');
      switcher.id = 'simple-settings-switcher';
      switcher.className = 'simple-settings-switcher';
      switcher.setAttribute('role', 'tablist');
      switcher.setAttribute('aria-label', 'Settings sections');
      switcher.innerHTML = `
        <button type="button" role="tab" data-simple-settings-section="user">
          <i data-lucide="user-cog" size="16"></i> User Settings
        </button>
        <button type="button" role="tab" data-simple-settings-section="panel">
          <i data-lucide="panel-top" size="16"></i> Web Panel Settings
        </button>
      `;
      pageHeader.insertAdjacentElement('afterend', switcher);
    }

    let userPane = simplePage.querySelector('#simple-user-settings-pane');
    if (!userPane) {
      userPane = document.createElement('div');
      userPane.id = 'simple-user-settings-pane';
      userPane.className = 'simple-settings-pane';
      userPane.setAttribute('role', 'tabpanel');
      settingsGrid.insertAdjacentElement('beforebegin', userPane);
      userPane.appendChild(settingsGrid);
    }

    let panelPane = simplePage.querySelector('#simple-web-panel-settings-pane');
    if (!panelPane) {
      panelPane = document.createElement('div');
      panelPane.id = 'simple-web-panel-settings-pane';
      panelPane.className = 'simple-settings-pane';
      panelPane.setAttribute('role', 'tabpanel');
      userPane.insertAdjacentElement('afterend', panelPane);
    }

    switcher.querySelectorAll('[data-simple-settings-section]').forEach((button) => {
      if (button.dataset.settingsBound === '1') return;
      button.dataset.settingsBound = '1';
      button.addEventListener('click', () => activateSimpleSection(button.dataset.simpleSettingsSection));
    });

    activateSimpleSection(savedActiveSection());
    renderIcons(switcher);
    return true;
  }

  function installLegacySettingsView() {
    const nav = document.querySelector('.settings-section-nav');
    const stage = document.querySelector('.settings-stage');
    if (!nav || !stage || !settingsPayload) return false;

    let button = nav.querySelector('[data-settings-tab="media-branding"]');
    if (!button) {
      button = document.createElement('button');
      button.className = 'settings-tab-btn';
      button.type = 'button';
      button.dataset.settingsTab = 'media-branding';
      button.innerHTML = '<i data-lucide="panel-top"></i><span>Web Panel Settings</span>';
      nav.appendChild(button);
    }

    let view = stage.querySelector('[data-settings-view="media-branding"]');
    if (!view) {
      view = document.createElement('div');
      view.className = 'settings-view';
      view.dataset.settingsView = 'media-branding';
      stage.appendChild(view);
    }

    if (button.dataset.mediaBound !== '1') {
      button.dataset.mediaBound = '1';
      button.addEventListener('click', (event) => {
        event.preventDefault();
        document.querySelectorAll('.settings-tab-btn').forEach((item) => item.classList.remove('active'));
        document.querySelectorAll('.settings-view').forEach((item) => item.classList.remove('active'));
        button.classList.add('active');
        view.classList.add('active');
        renderPanelSettingsPane(view);
        window.requestAnimationFrame(syncPreviewPlayback);
      });
    }

    renderIcons(document.getElementById('view-settings') || document);
    return true;
  }

  function installSettingsView() {
    if (!settingsPayload) return;
    if (installSimpleSettingsView()) return;
    installLegacySettingsView();
  }

  function loadManagerSettings() {
    if (settingsPayload) return Promise.resolve(settingsPayload);
    if (settingsPromise) return settingsPromise;

    settingsPromise = Promise.all([
      fetch('/api/auth/me', { cache: 'no-store', credentials: 'same-origin' }),
      fetch('/api/media/settings', { cache: 'no-store', credentials: 'same-origin' }),
    ])
      .then(async ([authResponse, settingsResponse]) => {
        if (!authResponse.ok || !settingsResponse.ok) {
          throw new Error('Unable to load Web Panel Settings.');
        }
        const [authPayload, payload] = await Promise.all([
          authResponse.json(),
          settingsResponse.json(),
        ]);
        csrfToken = String(authPayload.csrfToken || '');
        settingsPayload = payload;
        return payload;
      })
      .catch((error) => {
        console.warn('[MEDIA SETTINGS]', error.message || error);
        return null;
      })
      .finally(() => {
        settingsPromise = null;
      });

    return settingsPromise;
  }

  async function ensureSettingsUi() {
    settingsRequested = true;
    await loadManagerSettings();
    installSettingsView();
    observeSettingsView();
  }

  function refreshPanelSettings() {
    const panelPane = document.getElementById('simple-web-panel-settings-pane');
    if (panelPane && !panelPane.hidden) renderPanelSettingsPane(panelPane, true);
    else if (panelPane) panelPane.dataset.renderKey = '';
  }

  async function uploadSlot(slot, input) {
    const file = input.files?.[0];
    if (!file) {
      showToast('Choose a file first.', 'error');
      return;
    }
    if (!settingsPayload?.canManage || !csrfToken || busySlot) return;

    busySlot = slot;
    refreshPanelSettings();

    try {
      const response = await fetch(`/api/media/${encodeURIComponent(slot)}`, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
          'X-File-Name': encodeURIComponent(file.name),
          'X-CSRF-Token': csrfToken,
        },
        body: file,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Upload failed.');

      settingsPayload.slots[slot] = payload.asset;
      updatePublicAsset(slot, payload.asset);
      showToast(`${SLOT_COPY[slot].title} updated.`);
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      busySlot = null;
      refreshPanelSettings();
    }
  }

  async function resetSlot(slot) {
    if (!settingsPayload?.canManage || !csrfToken || busySlot) return;

    busySlot = slot;
    refreshPanelSettings();

    try {
      const response = await fetch(`/api/media/${encodeURIComponent(slot)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'X-CSRF-Token': csrfToken },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Reset failed.');

      settingsPayload.slots[slot] = payload.asset;
      updatePublicAsset(slot, payload.asset);
      showToast(`${SLOT_COPY[slot].title} reset.`);
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      busySlot = null;
      refreshPanelSettings();
    }
  }

  function observeSettingsView() {
    const view = document.getElementById('view-settings');
    if (!view || settingsObserver) return;

    let scheduled = false;
    settingsObserver = new MutationObserver(() => {
      if (!settingsRequested || !settingsPayload || scheduled) return;
      const simplePage = view.querySelector('.simple-page');
      if (!simplePage || simplePage.querySelector('#simple-settings-switcher')) return;
      scheduled = true;
      window.requestAnimationFrame(() => {
        scheduled = false;
        installSettingsView();
      });
    });
    settingsObserver.observe(view, { childList: true, subtree: true });
  }

  function handleNavigationClick(event) {
    const item = event.target.closest('.nav-item[data-target]');
    if (!item) return;

    if (item.dataset.target === 'view-settings') {
      window.setTimeout(() => void ensureSettingsUi(), 0);
    }
    window.requestAnimationFrame(() => {
      syncDashboardPlayback();
      syncPreviewPlayback();
    });
  }

  function init() {
    installStyles();
    void loadPublicMedia();

    document.addEventListener('click', handleNavigationClick);
    document.addEventListener('visibilitychange', () => {
      syncDashboardPlayback();
      syncPreviewPlayback();
    });
    window.addEventListener('pagehide', () => {
      dashboardVideo?.pause();
      document.querySelectorAll('#simple-web-panel-settings-pane audio, #simple-web-panel-settings-pane video')
        .forEach((media) => media.pause());
    });

    if (isViewActive(document.getElementById('view-settings'))) {
      void ensureSettingsUi();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
