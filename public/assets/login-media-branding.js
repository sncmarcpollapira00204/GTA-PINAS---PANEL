'use strict';

(() => {
  let mediaPromise = null;

  document.title = 'GTA Pinas Roleplay Management Panel';

  function applyLoginUi() {
    if (document.getElementById('gtapinas-login-ui')) return;

    const style = document.createElement('style');
    style.id = 'gtapinas-login-ui';
    style.textContent = `
      .login-panel {
        width: min(460px, calc(100vw - 32px)) !important;
        padding: 32px !important;
        border: 1px solid rgba(255,255,255,.22) !important;
        border-radius: 24px !important;
        background: linear-gradient(145deg, rgba(10,18,34,.58), rgba(4,10,22,.38)) !important;
        box-shadow: 0 30px 90px rgba(0,0,0,.46), inset 0 1px 0 rgba(255,255,255,.10) !important;
        backdrop-filter: blur(22px) saturate(135%) !important;
        -webkit-backdrop-filter: blur(22px) saturate(135%) !important;
      }

      .login-panel::after {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: inherit;
        pointer-events: none;
        background: linear-gradient(135deg, rgba(255,255,255,.08), transparent 35%, rgba(98,197,255,.045));
      }

      .brand { gap: 15px !important; margin-bottom: 24px !important; }
      .brand img {
        width: 58px !important;
        height: 58px !important;
        padding: 7px !important;
        border: 1px solid rgba(255,255,255,.15) !important;
        border-radius: 16px !important;
        background: rgba(255,255,255,.06) !important;
        box-shadow: 0 12px 28px rgba(0,0,0,.24) !important;
      }
      .brand small { color: #8ed8ff !important; font-size: 9px !important; letter-spacing: .18em !important; }
      .brand h1 { font-size: 21px !important; letter-spacing: -.02em !important; }
      .description { margin-bottom: 24px !important; color: rgba(231,239,250,.78) !important; font-size: 13px !important; line-height: 1.7 !important; }

      .discord-login {
        min-height: 54px !important;
        border: 1px solid rgba(255,255,255,.10) !important;
        border-radius: 13px !important;
        background: linear-gradient(135deg, #5865f2, #4264e8) !important;
        box-shadow: 0 14px 32px rgba(66,100,232,.30) !important;
      }
      .discord-login:hover {
        background: linear-gradient(135deg, #6875ff, #4d70f2) !important;
        box-shadow: 0 18px 38px rgba(66,100,232,.38) !important;
      }

      .access-note { margin-top: 18px !important; padding-top: 17px !important; border-top-color: rgba(255,255,255,.12) !important; color: rgba(199,212,232,.72) !important; }
      .maintained { margin-top: 9px !important; color: rgba(255,255,255,.56) !important; }

      /* Keep only the play/pause control in the lower-right corner. */
      .ost-player {
        width: 52px !important;
        height: 52px !important;
        right: 20px !important;
        bottom: 20px !important;
        display: block !important;
        padding: 0 !important;
        border-radius: 50% !important;
        background: rgba(7,14,28,.48) !important;
        border: 1px solid rgba(255,255,255,.20) !important;
        box-shadow: 0 14px 35px rgba(0,0,0,.34) !important;
        backdrop-filter: blur(16px) saturate(130%) !important;
        -webkit-backdrop-filter: blur(16px) saturate(130%) !important;
      }
      .ost-copy, .ost-progress, .ost-mute { display: none !important; }
      .ost-toggle {
        display: grid !important;
        width: 52px !important;
        height: 52px !important;
        margin: 0 !important;
        border: 0 !important;
        border-radius: 50% !important;
        background: transparent !important;
      }
      .ost-toggle:hover { background: rgba(88,101,242,.18) !important; transform: none !important; }
      .ost-toggle svg { width: 19px !important; height: 19px !important; }
    `;
    document.head.appendChild(style);
  }

  function clearLoginBackground() {
    document.querySelector('.login-background')?.remove();
    document.querySelector('.background-overlay')?.remove();
  }

  function applyGtaPinasBranding() {
    applyLoginUi();

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
      element.textContent = 'Managed by Zoey';
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
      filter: 'brightness(.66) saturate(1.02)',
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
      background: 'linear-gradient(90deg, rgba(2,8,20,.14), rgba(2,8,20,.28)), linear-gradient(180deg, rgba(2,8,20,.06), rgba(2,8,20,.22))',
      pointerEvents: 'none',
    });

    page.prepend(media, overlay);
    if (asset.kind === 'video') void media.play().catch(() => {});
  }

  applyGtaPinasBranding();

  function replaceLoginMusic() {
    const audio = document.getElementById('loginOst');
    if (!audio) return;

    const forcedMusicUrl = `/assets/gtapinasmusic2.mp3?v=20260911-music4`;
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
        replaceLoginMusic();
        applyGtaPinasBranding();
        return payload;
      })
      .catch((error) => {
        console.warn('[LOGIN MEDIA]', error.message || error);
        replaceLoginMusic();
        applyGtaPinasBranding();
        return null;
      });

    return mediaPromise;
  }

  window.panelMediaReady = loadMedia();
})();
