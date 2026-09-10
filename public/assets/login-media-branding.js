'use strict';

(() => {
  let backgroundVideo = null;
  let mediaPromise = null;

  document.title = 'GTA Pinas Roleplay Panel';

  function applyGtaPinasBranding() {
    document.querySelectorAll('.brand img').forEach((img) => {
      img.src = '/assets/gta-pinas-logo.svg';
      img.alt = 'GTA Pinas Roleplay';
      img.removeAttribute('srcset');
    });

    const replacements = [
      ['5th Avenue Roleplay', 'GTA Pinas Roleplay'],
      ['5th Avenue Web Panel', 'GTA Pinas Web Panel'],
      ['5TH AVENUE ROLEPLAY', 'GTA PINAS ROLEPLAY'],
      ['5TH AVENUE', 'GTA PINAS'],
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

  applyGtaPinasBranding();

  function shouldPlayBackground() {
    return !document.hidden;
  }

  function syncBackgroundPlayback() {
    if (!backgroundVideo) return;
    if (shouldPlayBackground()) {
      void backgroundVideo.play().catch(() => {});
    } else {
      backgroundVideo.pause();
    }
  }

  function replaceLoginBackground(asset) {
    const current = document.querySelector('.login-background');
    if (!current || !asset?.url) return;

    const resolvedUrl = new URL(asset.url, window.location.href).href;

    if (asset.kind === 'video') {
      if (current.tagName === 'VIDEO') {
        backgroundVideo = current;
        if (current.src !== resolvedUrl) {
          current.src = asset.url;
          current.load();
        }
        current.muted = true;
        current.loop = true;
        current.playsInline = true;
        current.preload = 'metadata';
        syncBackgroundPlayback();
        return;
      }

      const video = document.createElement('video');
      video.className = current.className;
      video.src = asset.url;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = 'metadata';
      video.disablePictureInPicture = true;
      video.setAttribute('aria-hidden', 'true');
      current.replaceWith(video);
      backgroundVideo = video;
      syncBackgroundPlayback();
      return;
    }

    if (backgroundVideo) {
      backgroundVideo.pause();
      backgroundVideo.removeAttribute('src');
      backgroundVideo.load();
      backgroundVideo = null;
    }

    if (current.tagName === 'IMG') {
      if (current.src !== resolvedUrl) current.src = asset.url;
      current.decoding = 'async';
      current.fetchPriority = 'high';
      return;
    }

    const image = document.createElement('img');
    image.className = current.className;
    image.src = asset.url;
    image.alt = '';
    image.decoding = 'async';
    image.fetchPriority = 'high';
    image.setAttribute('aria-hidden', 'true');
    current.replaceWith(image);
  }

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
        replaceLoginBackground(payload.slots?.login_banner);
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

  document.addEventListener('visibilitychange', syncBackgroundPlayback);
  window.addEventListener('pagehide', () => backgroundVideo?.pause());
  window.panelMediaReady = loadMedia();
})();
