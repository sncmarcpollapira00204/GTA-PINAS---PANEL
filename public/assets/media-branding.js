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
      accept: '.png,.jpg,.jpeg,.webp,.gif,.webm,.mp4',
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
    const kind = String(asset?.kind || '').toLowerCase();

    if (kind === 'video') {
      const video = document.createElement('video');
      video.className = 'media-preview-player';
      video.src = asset.url;
      video.controls = true;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = 'metadata';
      preview.appendChild(video);
    } else if (kind === 'audio') {
      const audio = document.createElement('audio');
      audio.src = asset.url;
      audio.controls = true;
      audio.preload = 'metadata';
      preview.appendChild(audio);
    } else {
      const img = document.createElement('img');
      img.src = asset.url;
      img.alt = `${asset.label || 'Panel'} preview`;
      img.loading = 'lazy';
      preview.appendChild(img);
    }

    const badge = document.createElement('span');
    badge.className = 'media-preview-badge';
    badge.textContent = kind === 'video' ? 'Video' : kind === 'audio' ? 'Audio' : 'Image';
    preview.appendChild(badge);
    return preview;
  }

  function getUploadEndpoint(slot) {
    return `/api/media/${encodeURIComponent(slot)}`;
  }

  async function uploadSlot(slot, file) {
    if (!file) return;
    busySlot = slot;
    renderSettings();

    try {
      const response = await fetch(getUploadEndpoint(slot), {
        method: 'PUT',
        credentials: 'same-origin',
        headers: {
          'X-CSRF-Token': csrfToken,
          'X-File-Name': encodeURIComponent(file.name),
          'Content-Type': file.type || 'application/octet-stream',
        },
        body: file,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `Upload failed (${response.status}).`);
      updatePublicAsset(slot, payload.asset);
      settingsPayload.slots[slot] = payload.asset;
      showToast(payload.message || `${SLOT_COPY[slot].title} updated.`, 'success');
    } catch (error) {
      console.error('[MEDIA UPLOAD]', error);
      showToast(error.message || 'Unable to upload media.', 'error');
    } finally {
      busySlot = null;
      renderSettings();
    }
  }

  async function resetSlot(slot) {
    busySlot = slot;
    renderSettings();
    try {
      const response = await fetch(getUploadEndpoint(slot), {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'X-CSRF-Token': csrfToken },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `Reset failed (${response.status}).`);
      updatePublicAsset(slot, payload.asset);
      settingsPayload.slots[slot] = payload.asset;
      showToast(payload.message || `${SLOT_COPY[slot].title} reset.`, 'success');
    } catch (error) {
      console.error('[MEDIA RESET]', error);
      showToast(error.message || 'Unable to reset media.', 'error');
    } finally {
      busySlot = null;
      renderSettings();
    }
  }

  function renderMediaCard(slot) {
    const config = SLOT_COPY[slot];
    const asset = settingsPayload?.slots?.[slot];
    const card = document.createElement('article');
    card.className = 'media-settings-card';

    const heading = document.createElement('h3');
    heading.textContent = config.title;
    card.appendChild(heading);

    const description = document.createElement('p');
    description.textContent = config.description;
    card.appendChild(description);

    if (asset?.url) card.appendChild(createPreview(asset));

    const meta = document.createElement('div');
    meta.className = 'media-file-meta';
    meta.textContent = asset?.isDefault
      ? `Default • up to ${formatBytes(asset.maxBytes)}`
      : `${asset.originalName || 'Custom upload'} • ${formatBytes(asset.sizeBytes)}`;
    card.appendChild(meta);

    const picker = document.createElement('input');
    picker.className = 'media-file-picker';
    picker.type = 'file';
    picker.accept = config.accept;
    picker.disabled = busySlot !== null;
    picker.addEventListener('change', () => {
      const file = picker.files?.[0];
      picker.value = '';
      if (file) void uploadSlot(slot, file);
    });
    card.appendChild(picker);

    const actions = document.createElement('div');
    actions.className = 'media-card-actions';

    const replaceButton = document.createElement('button');
    replaceButton.className = 'btn primary';
    replaceButton.type = 'button';
    replaceButton.textContent = busySlot === slot ? 'Uploading...' : 'Upload / Replace';
    replaceButton.disabled = busySlot !== null;
    replaceButton.addEventListener('click', () => picker.click());
    actions.appendChild(replaceButton);

    const resetButton = document.createElement('button');
    resetButton.className = 'btn secondary';
    resetButton.type = 'button';
    resetButton.textContent = 'Reset';
    resetButton.disabled = busySlot !== null || Boolean(asset?.isDefault);
    resetButton.addEventListener('click', () => void resetSlot(slot));
    actions.appendChild(resetButton);

    card.appendChild(actions);
    return card;
  }

  function renderSettings() {
    const container = document.getElementById('simple-media-branding');
    if (!container) return;
    container.innerHTML = '';

    const heading = document.createElement('h2');
    heading.innerHTML = '<i data-lucide="image"></i> Web Media';
    container.appendChild(heading);

    const intro = document.createElement('p');
    intro.className = 'media-settings-intro';
    intro.textContent = 'Manage the dashboard banner, login background, and login music. MP4 video is supported for the login background.';
    container.appendChild(intro);

    if (!settingsPayload) {
      const loading = document.createElement('div');
      loading.className = 'panel-settings-lock';
      loading.innerHTML = '<div class="panel-settings-lock-inner"><div class="panel-settings-lock-icon"><i data-lucide="loader-circle"></i></div><h2>Loading media settings</h2><p>Fetching the latest panel media configuration.</p></div>';
      container.appendChild(loading);
      renderIcons(container);
      return;
    }

    const grid = document.createElement('div');
    grid.className = 'media-settings-grid';
    SLOT_ORDER.forEach((slot) => grid.appendChild(renderMediaCard(slot)));
    container.appendChild(grid);

    const note = document.createElement('div');
    note.className = 'media-settings-note';
    note.innerHTML = '<i data-lucide="info"></i><span>Large media files are stored through the panel media service so they do not need to be bundled into the HTML.</span>';
    container.appendChild(note);
    renderIcons(container);
    syncPreviewPlayback();
  }

  async function loadSettings() {
    if (settingsPromise) return settingsPromise;
    settingsPromise = fetch('/api/media/settings', {
      credentials: 'same-origin',
      cache: 'no-store',
    })
      .then((response) => {
        if (!response.ok) throw new Error(`Media settings returned ${response.status}.`);
        return response.json();
      })
      .then((payload) => {
        settingsPayload = payload;
        csrfToken = payload.csrfToken || '';
        renderSettings();
        return payload;
      })
      .catch((error) => {
        console.error('[MEDIA SETTINGS]', error);
        settingsPayload = null;
        renderSettings();
        showToast(error.message || 'Unable to load media settings.', 'error');
        return null;
      })
      .finally(() => {
        settingsRequested = true;
      });

    return settingsPromise;
  }

  function ensureMediaContainer() {
    let container = document.getElementById('simple-media-branding');
    if (container) return container;

    const panelPane = document.getElementById('simple-web-panel-settings-pane');
    if (!panelPane) return null;
    container = document.createElement('section');
    container.id = 'simple-media-branding';
    container.className = 'settings-card';
    panelPane.appendChild(container);
    return container;
  }

  function refreshVisibility() {
    const container = ensureMediaContainer();
    if (!container) return;
    container.hidden = !isPanelSettingsVisible();
    if (!container.hidden && !settingsRequested) void loadSettings();
    syncPreviewPlayback();
  }

  function observePanelSettings() {
    if (settingsObserver) return;
    settingsObserver = new MutationObserver(refreshVisibility);
    settingsObserver.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'hidden'],
    });
  }

  function init() {
    installStyles();
    ensureMediaContainer();
    observePanelSettings();
    refreshVisibility();
    void loadPublicMedia();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
