'use strict';

(() => {
  let mediaPromise = null;

  document.title = 'GTA Pinas Roleplay Management Panel';

  function clearLoginBackground() {
    document.querySelector('.login-background')?.remove();
    document.querySelector('.background-overlay')?.remove();
  }

  function applyGtaPinasBranding() {
    document.querySelectorAll('.brand img').forEach((img) => {
      img.src = '/assets/gta-pinas-logo.svg';
      img.alt = 'GTA Pinas Roleplay';
      img.removeAttribute('srcset');
    });

    document.querySelectorAll('.brand h1').forEach((element) => {
      element.textContent = 'GTA Pinas Roleplay';
    });

    document.querySelectorAll('.access-note').forEach((element) => {
      element.textContent = 'GTA Pinas Roleplay Management Panel';
    });

    document.querySelectorAll('.maintained').forEach((element) => {
      element.textContent = 'Manage by Zoey';
    });

    const replacements = [
      ['5th Avenue Roleplay', 'GTA Pinas Roleplay'],
      ['5th Avenue Web Panel', 'GTA Pinas Web Panel'],
      ['5TH AVENUE ROLEPLAY', 'GTA PINAS ROLEPLAY'],
      ['5TH AVENUE', 'GTA PINAS'],
      ['5th Avenue × University registered staff only.', 'GTA Pinas Roleplay Management Panel'],
      ['Maintained by Yuu - Rora', 'Manage by Zoey'],
    ];

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let node;
    while ((node = walker.nextNode())) nodes.push(node);
    nodes.forEach((textNode) => {
      const parent = textNode.parentElement;
      if (!parent || /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA)$/.test(parent.tagName)) return;
      let next = textNode.nodeValue || '';
      replacements.forEach(([from, to]) => {
        next = next.split(from).join(to);
      });
      if (next !== textNode.nodeValue) textNode.nodeValue = next;
    });
  }

  function injectBackground(asset) {
    const page = document.querySelector('.page');
    if (!page || !asset?.url) return;

    clearLoginBackground();

    const resolvedUrl = new URL(asset.url, window.location.href).href;
    const media = asset.kind === 'video' ? document.createElement('video') : document.createElement('img');
    media.className = 'login-background';
    media.src = resolvedUrl;
    media.setAttribute('aria-hidden', 'true');

    if (asset.kind === 'video') {
      media.muted = true;
      media.loop = true;
      media.autoplay = true;
      media.playsInline = true;
      media.preload = 'metadata';
      media.disablePictureInPicture = true;
    } else {
      media.alt = '';
      media.decoding = 'async';
      media.loading = 'eager';
    }

    Object.assign(media.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      objectPosition: 'center',
      zIndex: '0',
      filter: 'brightness(.60) saturate(.95)',
      pointerEvents: 'none',
      userSelect: 'none',
    });

    const overlay = document.createElement('div');
    overlay.className = 'background-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    Object.assign(overlay.style, {
      position: 'absolute',
      inset: '0',
      zIndex: '1',
      background: 'linear-gradient(90deg, rgba(2,8,20,.22), rgba(2,8,20,.46)), linear-gradient(180deg, rgba(2,8,20,.16), rgba(2,8,20,.38))',
      pointerEvents: 'none',
    });

    page.prepend(media, overlay);
    if (asset.kind === 'video') void media.play().catch(() => {});
  }

  applyGtaPinasBranding();

  function replaceLoginMusic(asset) {
    const audio = document.getElementById('loginOst');
    if (!audio || !asset?.url) return;

    const resolvedUrl = new URL(asset.url, window.location.href).href;
    if (audio.src !== resolvedUrl) {
      const wasPlaying = !audio.paused;
      audio.src = asset.url;
      audio.preload = 'metadata';
      audio.load();
      if (wasPlaying) void audio.play().catch(() => {});
    }

    const watermark = document.querySelector('.ost-watermark');
    if (watermark) {
      watermark.textContent = asset.isDefault
        ? 'GTA Pinas OST'
        : (asset.originalName || 'GTA Pinas Web Music');
    }
  }

  function loadMedia() {
    if (mediaPromise) return mediaPromise;

    mediaPromise = fetch('/media/config', {
      cache: 'default',
      credentials: 'same-origin',
    })
      .then((response) => {
        if (!response.ok) throw new Error(`Media config returned ${response.status}.`);
        return response.json();
      })
      .then((payload) => {
        injectBackground(payload.slots?.login_banner);
        replaceLoginMusic(payload.slots?.login_music);
        applyGtaPinasBranding();
        return payload;
      })
      .catch((error) => {
        console.warn('[LOGIN MEDIA]', error.message || error);
        applyGtaPinasBranding();
        return null;
      });

    return mediaPromise;
  }

  window.panelMediaReady = loadMedia();
})();
