'use strict';

(() => {
  let mediaPromise = null;

  document.title = 'GTA Pinas Roleplay Panel';

  function removeLoginBackground() {
    document.querySelector('.login-background')?.remove();
    document.querySelector('.background-overlay')?.remove();
  }

  function applyGtaPinasBranding() {
    removeLoginBackground();

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
        removeLoginBackground();
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
