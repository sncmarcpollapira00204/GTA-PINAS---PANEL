'use strict';

(() => {
  const CONFIRMATION_TEXT = 'DELETE ALL DATABASES';
  let clearing = false;

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

  function installStyles() {
    if (document.getElementById('import-database-clear-styles')) return;

    const style = document.createElement('style');
    style.id = 'import-database-clear-styles';
    style.textContent = `
      #view-import .import-database-backup,
      #view-import .import-database-danger{
        padding:18px;
        border-radius:10px;
        background:var(--bg-card);
      }
      #view-import .import-database-backup{
        margin-top:18px;
        border:1px solid rgba(34,197,94,.30);
      }
      #view-import .import-database-danger{
        margin-top:14px;
        border:1px solid rgba(239,68,68,.30);
      }
      #view-import .import-database-backup:hover,
      #view-import .import-database-danger:hover{
        transform:none!important;
        box-shadow:none!important;
      }
      #view-import .import-database-backup h2,
      #view-import .import-database-danger h2{
        margin:0 0 5px;
        font-size:15px;
        color:var(--text-main);
      }
      #view-import .import-database-backup>p,
      #view-import .import-database-danger>p{
        margin:0;
        color:var(--text-sec);
        font-size:11px;
        line-height:1.55;
      }
      #view-import .import-database-backup-row,
      #view-import .import-database-danger-row{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:18px;
        margin-top:15px;
        padding:13px;
        border-radius:9px;
        background:var(--bg-main);
      }
      #view-import .import-database-backup-row{
        border:1px solid rgba(34,197,94,.24);
      }
      #view-import .import-database-danger-row{
        border:1px solid rgba(239,68,68,.24);
      }
      #view-import .import-database-backup-copy,
      #view-import .import-database-danger-copy{
        min-width:0;
        flex:1;
      }
      #view-import .import-database-backup-copy strong,
      #view-import .import-database-danger-copy strong{
        display:block;
        color:var(--text-main);
        font-size:12px;
      }
      #view-import .import-database-backup-copy span,
      #view-import .import-database-danger-copy span{
        display:block;
        margin-top:4px;
        color:var(--text-sec);
        font-size:9px;
        line-height:1.5;
      }
      #view-import .import-database-backup-actions{
        display:flex;
        align-items:center;
        gap:8px;
        flex:0 0 auto;
      }
      #view-import .import-database-backup-actions .btn{
        text-decoration:none;
        white-space:nowrap;
      }
      #import-clear-layer{
        position:fixed;
        inset:0;
        z-index:180;
        display:grid;
        place-items:center;
        padding:18px;
        background:rgba(0,0,0,.72);
      }
      #import-clear-layer[hidden]{display:none!important}
      #import-clear-dialog{
        width:min(450px,100%);
        overflow:hidden;
        border:1px solid rgba(239,68,68,.35);
        border-radius:12px;
        background:var(--bg-card);
        box-shadow:0 24px 70px rgba(0,0,0,.50);
      }
      #import-clear-dialog header{
        padding:16px 17px;
        border-bottom:1px solid var(--border);
      }
      #import-clear-dialog header h2{
        margin:0;
        font-size:16px;
      }
      #import-clear-dialog header p,
      #import-clear-dialog .import-clear-body>p{
        margin:5px 0 0;
        color:var(--text-sec);
        font-size:11px;
        line-height:1.55;
      }
      #import-clear-dialog .import-clear-body{
        padding:17px;
      }
      #import-clear-dialog label{
        display:block;
        margin-top:14px;
        color:var(--text-sec);
        font-size:10px;
      }
      #import-clear-text{
        width:100%;
        height:40px;
        margin-top:7px;
        padding:0 11px;
        border:1px solid var(--border);
        border-radius:8px;
        outline:0;
        background:var(--bg-main);
        color:var(--text-main);
      }
      #import-clear-text:focus{border-color:#ef4444}
      #import-clear-dialog .import-clear-check{
        display:flex;
        align-items:flex-start;
        gap:8px;
        text-transform:none;
        letter-spacing:0;
        font-weight:400;
        line-height:1.45;
      }
      #import-clear-dialog .import-clear-check input{margin-top:2px}
      #import-clear-dialog footer{
        display:flex;
        justify-content:flex-end;
        gap:8px;
        padding:14px 17px;
        border-top:1px solid var(--border);
      }
      @media(max-width:820px){
        #view-import .import-database-backup-row,
        #view-import .import-database-danger-row{
          align-items:stretch;
          flex-direction:column;
        }
        #view-import .import-database-backup-actions{
          width:100%;
        }
        #view-import .import-database-backup-actions .btn,
        #view-import .import-database-danger-row .btn{
          flex:1;
          width:100%;
        }
      }
      @media(max-width:540px){
        #view-import .import-database-backup-actions{
          flex-direction:column;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function removeBackupCenter() {
    document.querySelectorAll('[data-target="view-backup"]').forEach((element) => element.remove());
    document.getElementById('view-backup')?.remove();
  }

  function installBackupTool(view, page) {
    if (!view || !page || document.getElementById('import-database-backup')) return;

    const card = document.createElement('section');
    card.id = 'import-database-backup';
    card.className = 'import-database-backup';
    card.innerHTML = `
      <h2>Database backup</h2>
      <p>Download a fresh copy of the current Ticket Web Panel database before migration, restore, or database maintenance.</p>
      <div class="import-database-backup-row">
        <div class="import-database-backup-copy">
          <strong>Save your current database</strong>
          <span>JSON can be restored directly in Step 1 above. ZIP contains the same JSON backup plus migration instructions.</span>
        </div>
        <div class="import-database-backup-actions">
          <a class="btn btn-success" href="/api/backup/json">
            <i data-lucide="file-json" size="15"></i> Download JSON
          </a>
          <a class="btn btn-outline" href="/api/backup/zip">
            <i data-lucide="archive" size="15"></i> Download ZIP
          </a>
        </div>
      </div>
    `;

    const dangerCard = document.getElementById('import-database-danger');
    if (dangerCard && dangerCard.parentNode === page) {
      page.insertBefore(card, dangerCard);
    } else {
      page.appendChild(card);
    }

    renderIcons(card);
  }

  function modalMarkup() {
    return `
      <div id="import-clear-layer" hidden aria-hidden="true">
        <div id="import-clear-dialog" role="dialog" aria-modal="true" aria-labelledby="import-clear-title">
          <header>
            <h2 id="import-clear-title">Clear all databases?</h2>
            <p>This permanently deletes all Gatekeeper and Ticket records.</p>
          </header>
          <div class="import-clear-body">
            <p>Type <strong>${CONFIRMATION_TEXT}</strong> to continue.</p>
            <label>Confirmation
              <input id="import-clear-text" type="text" autocomplete="off" spellcheck="false">
            </label>
            <label class="import-clear-check">
              <input id="import-clear-check" type="checkbox">
              <span>I understand that this action cannot be undone.</span>
            </label>
          </div>
          <footer>
            <button id="import-clear-cancel" class="btn btn-outline" type="button">Cancel</button>
            <button id="import-clear-confirm" class="btn btn-danger" type="button" disabled>Clear databases</button>
          </footer>
        </div>
      </div>
    `;
  }

  function installClearTool() {
    removeBackupCenter();

    const view = document.getElementById('view-import');
    const page = view?.querySelector('.simple-page');
    if (!view || !page) return;

    installBackupTool(view, page);
    if (document.getElementById('import-database-danger')) return;

    const card = document.createElement('section');
    card.id = 'import-database-danger';
    card.className = 'import-database-danger';
    card.innerHTML = `
      <h2>Database maintenance</h2>
      <p>Use this only before a complete rebuild or migration.</p>
      <div class="import-database-danger-row">
        <div class="import-database-danger-copy">
          <strong>Clear all databases</strong>
          <span>Permanently removes every Gatekeeper and Ticket record. Table structures remain.</span>
        </div>
        <button id="import-clear-open" class="btn btn-danger" type="button">
          <i data-lucide="trash-2" size="15"></i> Clear databases
        </button>
      </div>
    `;

    page.appendChild(card);

    if (!document.getElementById('import-clear-layer')) {
      view.insertAdjacentHTML('beforeend', modalMarkup());
    }

    bindEvents();
    renderIcons(view);
  }

  function openDialog() {
    const layer = document.getElementById('import-clear-layer');
    const text = document.getElementById('import-clear-text');
    const check = document.getElementById('import-clear-check');
    if (!layer || !text || !check) return;

    text.value = '';
    check.checked = false;
    layer.hidden = false;
    layer.setAttribute('aria-hidden', 'false');
    updateConfirmation();
    window.setTimeout(() => text.focus(), 0);
  }

  function closeDialog() {
    if (clearing) return;
    const layer = document.getElementById('import-clear-layer');
    if (!layer) return;
    layer.hidden = true;
    layer.setAttribute('aria-hidden', 'true');
  }

  function updateConfirmation() {
    const text = document.getElementById('import-clear-text')?.value.trim();
    const checked = Boolean(document.getElementById('import-clear-check')?.checked);
    const button = document.getElementById('import-clear-confirm');
    if (button) button.disabled = clearing || text !== CONFIRMATION_TEXT || !checked;
  }

  async function clearDatabases() {
    if (clearing) return;

    const button = document.getElementById('import-clear-confirm');
    clearing = true;
    if (button) {
      button.disabled = true;
      button.textContent = 'Clearing...';
    }

    try {
      const response = await fetch('/api/backup/clear-databases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation: CONFIRMATION_TEXT }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to clear databases.');

      const total = Number(payload.totalRowsCleared || 0).toLocaleString();
      showToast(`${total} records were cleared.`);
      window.setTimeout(() => window.location.replace('/login?reset=1'), 900);
    } catch (error) {
      clearing = false;
      if (button) button.textContent = 'Clear databases';
      updateConfirmation();
      showToast(error.message, 'error');
    }
  }

  function bindEvents() {
    const open = document.getElementById('import-clear-open');
    if (open && open.dataset.bound !== '1') {
      open.dataset.bound = '1';
      open.addEventListener('click', openDialog);
    }

    const cancel = document.getElementById('import-clear-cancel');
    if (cancel && cancel.dataset.bound !== '1') {
      cancel.dataset.bound = '1';
      cancel.addEventListener('click', closeDialog);
    }

    const confirm = document.getElementById('import-clear-confirm');
    if (confirm && confirm.dataset.bound !== '1') {
      confirm.dataset.bound = '1';
      confirm.addEventListener('click', clearDatabases);
    }

    const text = document.getElementById('import-clear-text');
    if (text && text.dataset.bound !== '1') {
      text.dataset.bound = '1';
      text.addEventListener('input', updateConfirmation);
    }

    const check = document.getElementById('import-clear-check');
    if (check && check.dataset.bound !== '1') {
      check.dataset.bound = '1';
      check.addEventListener('change', updateConfirmation);
    }

    const layer = document.getElementById('import-clear-layer');
    if (layer && layer.dataset.bound !== '1') {
      layer.dataset.bound = '1';
      layer.addEventListener('click', (event) => {
        if (event.target === layer) closeDialog();
      });
    }
  }

  function init() {
    installStyles();
    removeBackupCenter();
    installClearTool();

    const importView = document.getElementById('view-import');
    if (importView) {
      new MutationObserver(() => {
        window.requestAnimationFrame(installClearTool);
      }).observe(importView, { childList: true, subtree: true });
    }

    document.querySelector('.nav-item[data-target="view-import"]')?.addEventListener('click', () => {
      window.setTimeout(installClearTool, 0);
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeDialog();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
