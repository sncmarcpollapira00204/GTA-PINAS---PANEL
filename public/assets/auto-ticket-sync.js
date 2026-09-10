'use strict';

(() => {
  const SYNC_INTERVAL_MS = 20000;
  const nativeFetch = window.fetch.bind(window);
  let timer = null;
  let running = false;
  let lastVersion = null;

  // The legacy panel asks for ticket data through /api/tickets and also calls a
  // removed whitelist endpoint. Normalize those requests before any DOM-ready
  // sync starts so the dashboard, ticket lists, and transcript viewer share one
  // reliable data path.
  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    const method = String(init?.method || (typeof input !== 'string' ? input?.method : 'GET') || 'GET').toUpperCase();
    let path = url;
    let query = '';
    try {
      const parsed = new URL(url, window.location.origin);
      path = parsed.pathname;
      query = parsed.search;
    } catch (_) {}

    if (method === 'GET' && path === '/api/tickets') {
      return nativeFetch(`/api/tickets/simple${query}`, init);
    }

    if (method === 'GET' && path === '/api/whitelist/stats') {
      return new Response(JSON.stringify({ pending: 0, whitelisted: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return nativeFetch(input, init);
  };

  function getJson(url) {
    return window.fetch(url, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    }).then(async (response) => {
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || `Backend request failed (${response.status}).`);
      }
      return response.json();
    });
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
