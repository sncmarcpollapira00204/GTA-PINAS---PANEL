'use strict';

(() => {
  const nativeFetch = window.fetch.bind(window);
  const COMPAT = 'panel-api-compat-v2';

  function jsonResponse(payload, status = 200) {
    return new Response(JSON.stringify(payload), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    const method = String(init?.method || (typeof input !== 'string' ? input?.method : 'GET') || 'GET').toUpperCase();
    const path = (() => {
      try { return new URL(url, window.location.origin).pathname; } catch (_) { return url; }
    })();

    if (method === 'GET' && path === '/api/tickets') {
      const query = (() => {
        try { return new URL(url, window.location.origin).search; } catch (_) { return ''; }
      })();
      return nativeFetch(`/api/tickets/simple${query}`, init);
    }

    if (method === 'GET' && path === '/api/whitelist/stats') {
      // Whitelist is no longer part of the active panel. Return a valid empty payload
      // so the legacy dashboard sync cannot fail the entire refresh cycle.
      return jsonResponse({ pending: 0, whitelisted: 0 });
    }

    return nativeFetch(input, init);
  };

  const nativeShowToast = typeof window.showToast === 'function' ? window.showToast.bind(window) : null;
  if (nativeShowToast) {
    window.showToast = (message, type) => {
      const text = String(message || '');
      if (/Failed to connect to the backend API\.?/i.test(text)) {
        console.warn(`[${COMPAT}] Suppressed legacy aggregate API toast.`);
        return;
      }
      return nativeShowToast(message, type);
    };
  }

  async function forceRefresh() {
    try {
      if (typeof window.syncData === 'function') await Promise.resolve(window.syncData(false));
    } catch (error) {
      console.warn(`[${COMPAT}] Refresh failed:`, error.message);
    }
  }

  window.setTimeout(forceRefresh, 350);
  window.addEventListener('focus', forceRefresh);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) forceRefresh();
  });
})();
