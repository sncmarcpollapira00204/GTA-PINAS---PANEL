'use strict';

(() => {
  const SYNC_INTERVAL_MS = 20000;
  let timer = null;
  let running = false;
  let lastVersion = null;

  async function getJson(url) {
    const response = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`Backend request failed (${response.status}).`);
    return response.json();
  }

  async function sync() {
    if (running || document.hidden) return;
    running = true;

    try {
      const dashboard = await getJson('/api/dashboard');
      const version = dashboard?.ticketsVersion || `${dashboard?.openTickets || 0}:${dashboard?.closedTickets || 0}`;

      if (version !== lastVersion) {
        lastVersion = version;
        window.dispatchEvent(new CustomEvent('gta-pinas-ticket-sync', { detail: dashboard }));

        if (typeof window.syncData === 'function') {
          await Promise.resolve(window.syncData(false));
        }

        if (typeof window.renderTranscriptList === 'function') {
          await Promise.resolve(window.renderTranscriptList());
        }
      }
    } catch (error) {
      // Background syncing must never spam the user with error toasts.
      console.warn('[AUTO TICKET SYNC]', error.message);
    } finally {
      running = false;
    }
  }

  function start() {
    if (timer) clearInterval(timer);
    sync();
    timer = window.setInterval(sync, SYNC_INTERVAL_MS);
  }

  window.addEventListener('focus', sync);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) sync();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
