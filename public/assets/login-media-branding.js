'use strict';

(() => {
  let backgroundVideo = null;
  let mediaPromise = null;

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
        ? '5th Avenue OST by Joji'
        : (asset.originalName || '5th Avenue Web Music');
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
        return payload;
      })
      .catch((error) => {
        console.warn('[LOGIN MEDIA]', error.message || error);
        return null;
      });

    return mediaPromise;
  }

  document.addEventListener('visibilitychange', syncBackgroundPlayback);
  window.addEventListener('pagehide', () => backgroundVideo?.pause());
  window.panelMediaReady = loadMedia();
})();
