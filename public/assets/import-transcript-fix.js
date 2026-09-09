'use strict';

(() => {
  const GATEKEEPER_STATUS_KEY = '5A_TRANSCRIPT_METADATA_COLLAPSED';
  let gatekeeperBusy = false;

  function renderIcons(root = document) {
    if (typeof window.renderPanelIcons === 'function') {
      window.renderPanelIcons({ root });
      return;
    }
    if (window.lucide) window.lucide.createIcons();
  }

  function showToast(message, type = 'success') {
    if (typeof window.showToast === 'function') {
      window.showToast(message, type);
    }
  }

  async function requestJson(url, options = {}) {
    const response = await fetch(url, {
      cache: 'no-store',
      credentials: 'same-origin',
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || `Request failed (${response.status}).`);
    }
    return payload;
  }

  function sleep(milliseconds) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }

  function installStyles() {
    if (document.getElementById('import-transcript-fix-styles')) return;

    const style = document.createElement('style');
    style.id = 'import-transcript-fix-styles';
    style.textContent = `
      .gatekeeper-import-card{padding:18px;border:1px solid var(--border);border-radius:10px;background:var(--bg-card)}
      .gatekeeper-import-card:hover{transform:none!important;box-shadow:none!important}
      .gatekeeper-import-card h2{font-size:15px;margin:0 0 5px}
      .gatekeeper-import-card>p{font-size:11px;margin:0;color:var(--text-sec)}
      .gatekeeper-import-action{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-top:15px;padding:13px;border:1px solid var(--border);border-radius:9px;background:var(--bg-main)}
      .gatekeeper-import-action strong{display:block;font-size:12px;color:var(--text-main)}
      .gatekeeper-import-action span{display:block;margin-top:4px;font-size:9px;line-height:1.5;color:var(--text-sec)}
      .gatekeeper-import-action .btn{min-width:245px}

      #view-transcripts .transcript-workspace.right-meta-workspace{
        display:grid!important;
        grid-template-columns:minmax(240px,300px) minmax(0,1fr) 280px!important;
        gap:14px!important;
        align-items:stretch!important;
      }
      #view-transcripts .transcript-workspace.right-meta-workspace.meta-right-collapsed{
        grid-template-columns:minmax(240px,300px) minmax(0,1fr) 44px!important;
      }
      #view-transcripts #transcript-meta-panel.simple-meta-panel.right-meta-panel{
        display:block!important;
        grid-column:3!important;
        grid-row:1!important;
        width:auto!important;
        min-width:0!important;
        max-width:none!important;
        align-self:stretch!important;
        overflow:hidden!important;
        padding:16px!important;
        transition:none!important;
      }
      #view-transcripts #transcript-meta-panel.right-meta-panel .transcript-meta-heading{
        display:flex!important;
        align-items:center!important;
        gap:10px!important;
        cursor:default!important;
        margin:0 0 14px!important;
        padding:0 0 12px!important;
        border-bottom:1px solid var(--border)!important;
      }
      #view-transcripts .right-meta-toggle{
        margin-left:auto;
        width:30px;
        height:30px;
        display:grid;
        place-items:center;
        flex:0 0 auto;
        border:1px solid var(--border);
        border-radius:7px;
        color:var(--text-sec);
        background:var(--bg-main);
        cursor:pointer;
      }
      #view-transcripts .right-meta-toggle:hover{color:var(--text-main);border-color:var(--border-light)}
      #view-transcripts .right-meta-panel.is-right-collapsed{
        padding:6px!important;
      }
      #view-transcripts .right-meta-panel.is-right-collapsed .transcript-meta-heading{
        justify-content:center!important;
        margin:0!important;
        padding:0!important;
        border:0!important;
      }
      #view-transcripts .right-meta-panel.is-right-collapsed .transcript-meta-heading>div,
      #view-transcripts .right-meta-panel.is-right-collapsed .transcript-meta-list{
        display:none!important;
      }
      #view-transcripts .right-meta-panel.is-right-collapsed .right-meta-toggle{
        margin:0!important;
      }

      @media(max-width:900px){
        #view-transcripts .transcript-workspace.right-meta-workspace,
        #view-transcripts .transcript-workspace.right-meta-workspace.meta-right-collapsed{
          grid-template-columns:1fr!important;
        }
        #view-transcripts #transcript-meta-panel.simple-meta-panel.right-meta-panel{
          position:fixed!important;
          top:72px!important;
          right:0!important;
          bottom:0!important;
          z-index:70!important;
          width:min(320px,86vw)!important;
          background:var(--bg-card)!important;
          border-radius:10px 0 0 10px!important;
          box-shadow:-12px 0 30px rgba(0,0,0,.3)!important;
        }
        #view-transcripts #transcript-meta-panel.right-meta-panel.is-right-collapsed{
          width:44px!important;
        }
      }

      @media(max-width:760px){
        .gatekeeper-import-action{align-items:stretch;flex-direction:column}
        .gatekeeper-import-action .btn{width:100%;min-width:0}
      }
    `;
    document.head.appendChild(style);
  }

  function updateImportStatus(job, fallbackMessage = '') {
    const box = document.getElementById('simple-import-status');
    if (!box) return;

    const progress = Math.max(0, Math.min(100, Number(job?.progress || 0)));
    box.classList.add('show');

    const stage = document.getElementById('simple-import-stage');
    const percent = document.getElementById('simple-import-percent');
    const bar = document.getElementById('simple-import-bar');
    const message = document.getElementById('simple-import-message');

    if (stage) stage.textContent = job?.stage || 'Importing Gatekeeper data';
    if (percent) percent.textContent = `${progress}%`;
    if (bar) bar.style.width = `${progress}%`;
    if (message) message.textContent = job?.message || fallbackMessage || 'Working...';
  }

  function setImportButtonsDisabled(disabled) {
    document.querySelectorAll('.simple-import-button, #gatekeeper-import-button').forEach((button) => {
      button.disabled = disabled;
    });

    const button = document.getElementById('gatekeeper-import-button');
    if (button) {
      button.innerHTML = disabled && gatekeeperBusy
        ? '<i data-lucide="loader-circle" size="15"></i> Importing...'
        : '<i data-lucide="database" size="15"></i> Import Gatekeeper Data';
    }
    renderIcons(document.getElementById('view-import') || document);
  }

  async function startGatekeeperImport() {
    if (gatekeeperBusy) return;

    gatekeeperBusy = true;
    setImportButtonsDisabled(true);
    updateImportStatus({
      progress: 0,
      stage: 'Starting Gatekeeper import',
      message: 'Connecting to the Main Bot...',
    });

    try {
      const payload = await requestJson('/api/backup/gatekeeper', {
        method: 'POST',
        body: '{}',
      });
      const jobId = payload.job?.id;
      if (!jobId) throw new Error('The Main Bot did not return an import job ID.');

      updateImportStatus(payload.job, payload.message);

      while (true) {
        await sleep(1300);
        const current = await requestJson(`/api/backup/gatekeeper/${encodeURIComponent(jobId)}`);
        const job = current.job || current;
        updateImportStatus(job);

        if (job.status === 'complete' || job.status === 'completed') {
          updateImportStatus({
            ...job,
            progress: 100,
            stage: 'Gatekeeper import complete',
            message: 'Whitelist, vouches, revokes, cooldowns, admin activity, and staff counters were rebuilt from Discord.',
          });
          showToast('Gatekeeper data imported from Discord.');
          if (typeof window.syncData === 'function') window.syncData(false);
          if (typeof window.refreshStaffProfiles === 'function') {
            window.refreshStaffProfiles({ force: true, quiet: true });
          }
          if (typeof window.loadStaffPerformance === 'function') window.loadStaffPerformance();
          break;
        }

        if (job.status === 'failed') {
          throw new Error(job.error || 'Gatekeeper import failed.');
        }
      }
    } catch (error) {
      updateImportStatus({ progress: 0, stage: 'Import failed', message: error.message });
      showToast(error.message, 'error');
    } finally {
      gatekeeperBusy = false;
      setImportButtonsDisabled(false);
    }
  }

  function installGatekeeperImport() {
    const page = document.querySelector('#view-import .simple-page');
    if (!page || document.getElementById('gatekeeper-import-card')) return;

    const ticketCard = page.querySelector('.simple-card');
    if (!ticketCard) return;

    const card = document.createElement('section');
    card.id = 'gatekeeper-import-card';
    card.className = 'gatekeeper-import-card';
    card.innerHTML = `
      <h2>Gatekeeper data</h2>
      <p>Uses the same Discord rebuild as <code>/gatekeeperbackup</code>.</p>
      <div class="gatekeeper-import-action">
        <div>
          <strong>Whitelist and Gatekeeper records</strong>
          <span>Imports whitelist applications, vouches, approved revokes, active role cooldowns, admin activity, and staff ticket counters.</span>
        </div>
        <button id="gatekeeper-import-button" class="btn btn-primary" type="button">
          <i data-lucide="database" size="15"></i> Import Gatekeeper Data
        </button>
      </div>
    `;

    page.insertBefore(card, ticketCard);
    document.getElementById('gatekeeper-import-button')?.addEventListener('click', startGatekeeperImport);
    renderIcons(card);
  }

  function installRightMetadataPanel() {
    const panel = document.getElementById('transcript-meta-panel');
    const workspace = panel?.closest('.transcript-workspace');
    if (!panel || !workspace) return;
    if (panel.querySelector('.right-meta-toggle')) return;

    panel.classList.add('simple-meta-panel', 'right-meta-panel');
    panel.classList.remove('is-collapsed');
    workspace.classList.add('right-meta-workspace');

    const oldHeading = panel.querySelector('.transcript-meta-heading');
    if (!oldHeading) return;

    const heading = oldHeading.cloneNode(true);
    heading.querySelectorAll('.simple-meta-toggle, svg, i').forEach((element) => element.remove());
    oldHeading.replaceWith(heading);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'right-meta-toggle';
    button.setAttribute('aria-label', 'Collapse ticket details to the right');
    heading.appendChild(button);

    const setCollapsed = (collapsed) => {
      panel.classList.toggle('is-right-collapsed', collapsed);
      workspace.classList.toggle('meta-right-collapsed', collapsed);
      button.setAttribute('aria-expanded', String(!collapsed));
      button.setAttribute(
        'aria-label',
        collapsed ? 'Expand ticket details from the right' : 'Collapse ticket details to the right'
      );
      button.innerHTML = collapsed
        ? '<i data-lucide="chevrons-left" size="16"></i>'
        : '<i data-lucide="chevrons-right" size="16"></i>';
      try {
        sessionStorage.setItem(GATEKEEPER_STATUS_KEY, collapsed ? '1' : '0');
      } catch (_) {}
      renderIcons(button);
    };

    button.addEventListener('click', () => {
      setCollapsed(!panel.classList.contains('is-right-collapsed'));
    });

    let collapsed = false;
    try {
      collapsed = sessionStorage.getItem(GATEKEEPER_STATUS_KEY) === '1';
    } catch (_) {}
    setCollapsed(collapsed);
  }

  function init() {
    installStyles();
    installGatekeeperImport();
    installRightMetadataPanel();

    const importView = document.getElementById('view-import');
    if (importView) {
      new MutationObserver(installGatekeeperImport).observe(importView, {
        childList: true,
        subtree: true,
      });
    }

    const transcriptView = document.getElementById('view-transcripts');
    if (transcriptView) {
      new MutationObserver(installRightMetadataPanel).observe(transcriptView, {
        childList: true,
        subtree: true,
      });
    }

    document.querySelector('.nav-item[data-target="view-import"]')?.addEventListener('click', () => {
      window.setTimeout(installGatekeeperImport, 0);
    });
    document.querySelector('.nav-item[data-target="view-transcripts"]')?.addEventListener('click', () => {
      window.setTimeout(installRightMetadataPanel, 0);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
