'use strict';

(() => {
  const SOURCE = {
    transcriptChannelId: '1531349051998732349',
    categories: [
      { key: 'report', label: 'Report', id: '1531348087224926399' },
      { key: 'suggestions', label: 'Suggestions', id: '1531460333065994330' },
      { key: 'ban_appeal', label: 'Ban Appeal', id: '1531348383027953906' },
      { key: 'booster', label: 'Booster', id: '1531855766946840657' },
    ],
  };

  let busy = false;
  let observer = null;
  let lastRenderedSignature = '';

  const esc = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  function icons(root = document) {
    if (typeof window.renderPanelIcons === 'function') window.renderPanelIcons({ root });
    else if (window.lucide) window.lucide.createIcons();
  }

  function toast(message, type = 'success') {
    if (typeof window.showToast === 'function') window.showToast(message, type);
  }

  async function request(url, options = {}) {
    const response = await fetch(url, {
      cache: 'no-store',
      credentials: 'same-origin',
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Request failed (${response.status}).`);
    return payload;
  }

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function statusBox(view) {
    return view.querySelector('#import-source-status');
  }

  function updateStatus(view, job, fallback = '') {
    const box = statusBox(view);
    if (!box) return;
    const progress = Math.max(0, Math.min(100, Number(job?.progress || 0)));
    box.classList.add('show');
    box.querySelector('[data-stage]').textContent = job?.stage || 'Importing tickets';
    box.querySelector('[data-percent]').textContent = `${progress}%`;
    box.querySelector('[data-bar]').style.width = `${progress}%`;
    box.querySelector('[data-message]').textContent = job?.message || fallback || 'Working...';
  }

  function setBusy(view, busyKey = null) {
    view.querySelectorAll('[data-source-import]').forEach((button) => {
      button.disabled = busy;
      const key = button.dataset.sourceImport;
      const item = SOURCE.categories.find((entry) => entry.key === key);
      button.innerHTML = busy && key === busyKey
        ? '<i data-lucide="loader-circle" size="15"></i> Importing...'
        : `<i data-lucide="download" size="15"></i> Import ${esc(item?.label || 'Tickets')}`;
    });
    icons(view);
  }

  async function runImport(view, category) {
    if (busy) return;
    busy = true;
    setBusy(view, category);
    updateStatus(view, { progress: 0, stage: 'Starting import', message: 'Connecting to Discord...' });

    try {
      const payload = await request(`/api/import/category/${encodeURIComponent(category)}`, {
        method: 'POST',
        body: '{}',
      });
      let jobId = payload.job?.id;
      updateStatus(view, payload.job, payload.message);

      while (jobId) {
        await sleep(1200);
        const job = await request(`/api/import/jobs/${encodeURIComponent(jobId)}`);
        updateStatus(view, job);
        if (job.status === 'completed') {
          toast(job.message || 'Ticket import completed.');
          if (typeof window.syncData === 'function') window.syncData(false);
          break;
        }
        if (job.status === 'failed') throw new Error(job.error || job.message || 'Ticket import failed.');
      }
    } catch (error) {
      updateStatus(view, { progress: 0, stage: 'Import failed', message: error.message });
      toast(error.message, 'error');
    } finally {
      busy = false;
      setBusy(view);
    }
  }

  function render(view) {
    if (!view) return;
    const signature = `${SOURCE.transcriptChannelId}|${SOURCE.categories.map((item) => `${item.key}:${item.id}`).join('|')}`;
    const hasOurButtons = SOURCE.categories.every((item) => view.querySelector(`[data-source-import="${item.key}"]`));
    if (view.dataset.importSourceTruthReady === '1' && hasOurButtons && lastRenderedSignature === signature) return;

    view.dataset.importSourceTruthReady = '1';
    lastRenderedSignature = signature;
    view.innerHTML = `
      <div class="simple-page">
        <div class="page-header">
          <div>
            <div class="page-kicker">Discord transcripts</div>
            <h1>Import Center</h1>
            <p>Import closed tickets using the configured transcript channel and ticket categories.</p>
          </div>
        </div>

        <section class="simple-card">
          <h2>Source of truth</h2>
          <p>Transcript channel: <strong>${SOURCE.transcriptChannelId}</strong></p>

          <div class="simple-button-list">
            ${SOURCE.categories.map((item) => `
              <div class="simple-import-row">
                <div>
                  <strong>${esc(item.label)}</strong>
                  <span>Category ID: ${esc(item.id)}</span>
                </div>
                <button class="btn btn-primary simple-import-button" type="button" data-source-import="${esc(item.key)}">
                  <i data-lucide="download" size="15"></i> Import ${esc(item.label)}
                </button>
              </div>
            `).join('')}
          </div>

          <div id="import-source-status" class="simple-job-status" aria-live="polite">
            <div class="simple-job-head">
              <strong data-stage>Preparing import</strong>
              <span data-percent>0%</span>
            </div>
            <div class="simple-progress"><span data-bar></span></div>
            <div data-message class="simple-job-message">Waiting.</div>
          </div>
        </section>
      </div>
    `;

    view.querySelectorAll('[data-source-import]').forEach((button) => {
      button.addEventListener('click', () => runImport(view, button.dataset.sourceImport));
    });
    icons(view);
  }

  function boot() {
    const view = document.getElementById('view-import');
    if (view) render(view);
    if (observer) observer.disconnect();
    observer = new MutationObserver(() => {
      const target = document.getElementById('view-import');
      if (!target) return;
      if (!target.querySelector('[data-source-import="report"]')) render(target);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
