'use strict';

(() => {
  const audio = document.getElementById('loginOst');
  const player = document.getElementById('ostPlayer');
  const toggle = document.getElementById('ostToggle');
  const muteButton = document.getElementById('ostMute');
  const status = document.getElementById('ostStatus');

  if (!audio || !player || !toggle || !status) return;

  const DEFAULT_VOLUME = 0.28;
  let policyMuted = false;
  let userPaused = false;
  let userMuted = false;
  let unlockListenersInstalled = false;

  audio.autoplay = true;
  audio.loop = true;
  audio.playsInline = true;
  audio.preload = 'auto';
  audio.volume = DEFAULT_VOLUME;

  function setStatus(message) {
    status.textContent = message;
  }

  function setMuteButton(muted) {
    if (!muteButton) return;
    muteButton.setAttribute('aria-pressed', String(muted));
    muteButton.setAttribute('aria-label', muted ? 'Unmute soundtrack' : 'Mute soundtrack');
  }

  function markPolicyMuted() {
    policyMuted = true;
    player.dataset.state = 'playing';
    setMuteButton(true);
    setStatus('Playing muted - tap anywhere for sound');
  }

  function markAudible() {
    policyMuted = false;
    userMuted = false;
    setMuteButton(false);
  }

  async function ensureMutedPlayback() {
    if (userPaused || userMuted) return false;

    audio.muted = true;
    policyMuted = true;

    try {
      await audio.play();
      markPolicyMuted();
      return true;
    } catch (_) {
      player.dataset.state = 'paused';
      setStatus('Press play to listen');
      return false;
    }
  }

  async function tryAudibleAutoplay() {
    if (userPaused || userMuted) return false;

    audio.muted = false;

    try {
      await audio.play();
      markAudible();
      removeUnlockListeners();
      return true;
    } catch (_) {
      audio.muted = true;
      await ensureMutedPlayback();
      return false;
    }
  }

  async function unlockSoundOnInteraction() {
    if (!policyMuted || userPaused || userMuted) return;

    // Call play() synchronously from the user-activation event. Awaiting anything
    // before this point can lose the browser's transient activation token.
    audio.muted = false;
    const playPromise = audio.play();

    try {
      await playPromise;
      markAudible();
      removeUnlockListeners();
    } catch (_) {
      audio.muted = true;
      policyMuted = true;
      void ensureMutedPlayback();
    }
  }

  function addUnlockListeners() {
    if (unlockListenersInstalled) return;
    unlockListenersInstalled = true;

    document.addEventListener('pointerdown', unlockSoundOnInteraction, true);
    document.addEventListener('keydown', unlockSoundOnInteraction, true);
    document.addEventListener('touchstart', unlockSoundOnInteraction, { capture: true, passive: true });
  }

  function removeUnlockListeners() {
    if (!unlockListenersInstalled) return;
    unlockListenersInstalled = false;

    document.removeEventListener('pointerdown', unlockSoundOnInteraction, true);
    document.removeEventListener('keydown', unlockSoundOnInteraction, true);
    document.removeEventListener('touchstart', unlockSoundOnInteraction, true);
  }

  // The inline player code is registered before this file. Let it toggle the
  // media first, then record the user's explicit preference.
  toggle.addEventListener('click', () => {
    window.setTimeout(() => {
      userPaused = audio.paused;
      if (!userPaused && audio.muted && !userMuted) {
        policyMuted = true;
        addUnlockListeners();
      }
    }, 0);
  });

  muteButton?.addEventListener('click', () => {
    window.setTimeout(() => {
      userMuted = audio.muted;
      policyMuted = false;
      if (!userMuted && !audio.paused) removeUnlockListeners();
    }, 0);
  });

  audio.addEventListener('play', () => {
    userPaused = false;
    if (!audio.muted) markAudible();
  });

  audio.addEventListener('pause', () => {
    // Ignore source swaps/load() during startup. A real user pause is captured
    // by the toggle click handler above.
    if (!policyMuted) player.dataset.state = 'paused';
  });

  audio.addEventListener('canplay', () => {
    if (!userPaused && !userMuted && audio.paused) {
      void ensureMutedPlayback();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !userPaused && !userMuted && audio.paused) {
      void ensureMutedPlayback();
    }
  });

  window.addEventListener('pageshow', () => {
    if (!userPaused && !userMuted && audio.paused) {
      void ensureMutedPlayback();
    }
  });

  async function init() {
    addUnlockListeners();

    // If the browser already accepted the inline audible autoplay, preserve it.
    // Otherwise begin muted playback immediately, before waiting for the dynamic
    // media request. This prevents a slow /media/config response from missing
    // autoplay or the user's first interaction.
    if (!audio.paused && !audio.muted) {
      markAudible();
      removeUnlockListeners();
    } else {
      void ensureMutedPlayback();
    }

    if (window.panelMediaReady && typeof window.panelMediaReady.then === 'function') {
      await window.panelMediaReady.catch(() => null);
    }

    // Dynamic media may replace the audio source and call load(). Restore
    // playback first, then make one audible autoplay attempt. Browsers that
    // block audible autoplay will keep the OST running muted until the first
    // real pointer/keyboard/touch interaction unlocks sound.
    if (!userPaused && !userMuted && audio.paused) {
      await ensureMutedPlayback();
    }

    if (!userPaused && !userMuted) {
      const audibleStarted = await tryAudibleAutoplay();
      if (!audibleStarted) addUnlockListeners();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => void init(), { once: true });
  } else {
    void init();
  }
})();
