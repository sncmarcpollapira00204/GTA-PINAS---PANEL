'use strict';

(() => {
  const SYNC_INTERVAL_MS = 20000;
  const nativeFetch = window.fetch.bind(window);
  let timer = null;
  let running = false;

  async function getJson(url) {
    const response = await nativeFetch(url, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Backend request failed (${response.status}).`);
    return payload;
  }

  function suppressLegacyBackendToast() {
    const toast = window.showToast;
    if (typeof toast !== 'function' || toast.__gtaCompatWrapped) return;
    const wrapped = (message, type) => {
      const text = String(message || '');
      if (/Failed to connect to the backend API\.?/i.test(text)) {
        console.warn('[PANEL SYNC] Suppressed legacy aggregate API toast.');
        return;
      }
      return toast(message, type);
    };
    wrapped.__gtaCompatWrapped = true;
    window.showToast = wrapped;
  }

  async function hardSync() {
    if (running || document.hidden) return;
    running = true;

    try {
      suppressLegacyBackendToast();

      const [dashboard, tickets] = await Promise.all([
        getJson('/api/dashboard'),
        getJson('/api/tickets/simple'),
      ]);

      const normalizedTickets = Array.isArray(tickets) ? tickets : [];
      const serialized = JSON.stringify(normalizedTickets).replace(/</g, '\\u003c');
      const dashboardJson = JSON.stringify(dashboard || {}).replace(/</g, '\\u003c');
      const bridge = `(() => {
        const dash = ${dashboardJson};
        const nextTickets = ${serialized};
        const openStat = document.getElementById('stat-open');
        const openNav = document.getElementById('nav-open-count');
        const closedStat = document.getElementById('stat-closed');
        if (openStat) openStat.textContent = String(dash.openTickets ?? 0);
        if (openNav) openNav.textContent = String(dash.openTickets ?? 0);
        if (closedStat) closedStat.textContent = String(dash.closedTickets ?? 0);
        try {
          allTickets = nextTickets;
          if (typeof renderTickets === 'function') renderTickets({ renderTranscripts: true });
          if (typeof renderTranscriptList === 'function' && document.getElementById('view-transcripts')?.classList.contains('active')) renderTranscriptList();
        } catch (error) {
          console.warn('[PANEL SYNC] ticket render bridge failed:', error);
        }
      })();`;
      window.eval(bridge);

      window.dispatchEvent(new CustomEvent('gta-pinas-ticket-sync', { detail: { dashboard, tickets: normalizedTickets } }));
    } catch (error) {
      console.warn('[PANEL SYNC]', error.message);
    } finally {
      running = false;
    }
  }

  function start() {
    suppressLegacyBackendToast();
    hardSync();
    if (timer) clearInterval(timer);
    timer = window.setInterval(hardSync, SYNC_INTERVAL_MS);
  }

  window.addEventListener('focus', hardSync);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) hardSync();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
