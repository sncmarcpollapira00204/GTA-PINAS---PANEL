'use strict';

(() => {
  let mediaPromise = null;

  document.title = 'GTA Pinas Roleplay Management Panel';

  function clearLoginBackground() {
    document.querySelector('.login-background')?.remove();
    document.querySelector('.background-overlay')?.remove();
  }

  function applyGtaPinasBranding() {
    document.querySelectorAll('.brand').forEach((brand) => {
      Object.assign(brand.style, {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0',
        marginBottom: '16px',
        textAlign: 'center',
      });
    });

    document.querySelectorAll('.brand img').forEach((img) => {
      img.src = '/assets/gta-pinas-logo.svg?v=20260911-logo2';
      img.alt = 'GTA Pinas Revamped';
      img.removeAttribute('srcset');
      Object.assign(img.style, {
        width: '220px',
        maxWidth: '78%',
        height: 'auto',
        aspectRatio: '128 / 102',
        objectFit: 'contain',
        flex: '0 0 auto',
        margin: '0 auto',
        mixBlendMode: 'screen',
        background: 'transparent',
        filter: 'drop-shadow(0 10px 20px rgba(0, 0, 0, 0.24))',
        animation: 'none',
      });
    });

    document.querySelectorAll('.brand small, .brand h1').forEach((element) => {
      element.style.display = 'none';
    });

    document.querySelectorAll('.access-note').forEach((element) => {
      element.textContent = 'GTA Pinas Roleplay Management Panel';
    });

    document.querySelectorAll('.maintained').forEach((element) => {
      element.textContent = 'Managed by Zoey';
    });

    document.querySelectorAll('.login-panel').forEach((panel) => {
      Object.assign(panel.style, {
        background: 'rgba(8, 16, 31, 0.48)',
        border: '1px solid rgba(255, 255, 255, 0.22)',
        borderRadius: '20px',
        boxShadow: '0 28px 80px rgba(0, 0, 0, 0.34), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
        backdropFilter: 'blur(24px) saturate(125%)',
        WebkitBackdropFilter: 'blur(24px) saturate(125%)',
      });
    });

    const replacements = [
      ['5th Avenue Roleplay', 'GTA Pinas Roleplay'],
      ['5th Avenue Web Panel', 'GTA Pinas Web Panel'],
      ['5TH AVENUE ROLEPLAY', 'GTA PINAS ROLEPLAY'],
      ['5TH AVENUE', 'GTA PINAS'],
      ['5th Avenue × University registered staff only.', 'GTA Pinas Roleplay Management Panel'],
      ['Maintained by Yuu - Rora', 'Managed by Zoey'],
      ['Manage by Zoey', 'Managed by Zoey'],
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
      filter: 'brightness(.78) saturate(1.02)',
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
      background: 'linear-gradient(90deg, rgba(2,8,20,.10), rgba(2,8,20,.22)), linear-gradient(180deg, rgba(2,8,20,.04), rgba(2,8,20,.16))',
      pointerEvents: 'none',
    });

    page.prepend(media, overlay);
    if (asset.kind === 'video') void media.play().catch(() => {});
  }

  applyGtaPinasBranding();

  function replaceLoginMusic(asset) {
    const audio = document.getElementById('loginOst');
    if (!audio) return;

    const forcedMusicUrl = `/assets/gtapinasmusic2.mp3?v=20260911-music3`;
    const resolvedUrl = new URL(forcedMusicUrl, window.location.href).href;

    if (audio.src !== resolvedUrl) {
      const wasPlaying = !audio.paused;
      audio.pause();
      audio.removeAttribute('src');
      audio.src = forcedMusicUrl;
      audio.preload = 'auto';
      audio.load();
      if (wasPlaying) void audio.play().catch(() => {});
    }

    const watermark = document.querySelector('.ost-watermark');
    if (watermark) watermark.textContent = 'GTA Pinas OST';
  }

  function loadMedia() {
    if (mediaPromise) return mediaPromise;

    mediaPromise = fetch('/media/config', {
      cache: 'no-store',
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
        replaceLoginMusic(null);
        applyGtaPinasBranding();
        return null;
      });

    return mediaPromise;
  }

  window.panelMediaReady = loadMedia();
})();
