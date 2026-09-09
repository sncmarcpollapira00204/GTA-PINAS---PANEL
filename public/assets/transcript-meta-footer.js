'use strict';

(() => {
  const PANEL_ID = 'transcript-meta-panel';
  const FOOTER_CLASS = 'transcript-meta-footer';
  const FRAME_SELECTOR = '#transcript-content iframe.transcript-frame-embed';

  function installStyles() {
    if (document.getElementById('transcript-meta-footer-styles')) return;

    const style = document.createElement('style');
    style.id = 'transcript-meta-footer-styles';
    style.textContent = `
      #view-transcripts #${PANEL_ID}.${'transcript-meta-fixed'}{
        display:flex!important;
        flex-direction:column!important;
      }

      #view-transcripts #${PANEL_ID} .${FOOTER_CLASS}{
        flex:0 0 auto!important;
        width:100%!important;
        margin-top:auto!important;
        padding:14px 12px 12px!important;
        display:flex!important;
        flex-direction:column!important;
        gap:10px!important;
        border-top:1px solid var(--border)!important;
        background:color-mix(in srgb,var(--bg-card) 96%,transparent)!important;
      }

      #view-transcripts #${PANEL_ID} .${FOOTER_CLASS} .transcript-meta-reason{
        width:100%!important;
        min-height:76px!important;
        margin:0!important;
        padding:11px!important;
        box-sizing:border-box!important;
      }

      #view-transcripts #${PANEL_ID} .${FOOTER_CLASS} .transcript-meta-reason p{
        margin-top:6px!important;
        line-height:1.45!important;
      }

      #view-transcripts #${PANEL_ID} .${FOOTER_CLASS} .transcript-meta-actions{
        width:100%!important;
        margin:0!important;
        display:block!important;
      }

      #view-transcripts #${PANEL_ID} .${FOOTER_CLASS} .transcript-meta-actions .btn{
        width:100%!important;
        min-height:40px!important;
        margin:0!important;
        display:flex!important;
        align-items:center!important;
        justify-content:center!important;
        gap:8px!important;
        box-sizing:border-box!important;
      }

      #view-transcripts #${PANEL_ID} .transcript-meta-list{
        padding-bottom:10px!important;
      }

      #view-transcripts #${PANEL_ID}.meta-fixed-collapsed .${FOOTER_CLASS}{
        display:none!important;
      }
    `;
    document.head.appendChild(style);
  }

  function arrangeMetadataFooter() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;

    panel.querySelector('#transcript-meta-copy')?.remove();

    const reason = panel.querySelector('.transcript-meta-reason');
    const actions = panel.querySelector('.transcript-meta-actions');
    if (!reason || !actions) return;

    let footer = panel.querySelector(`:scope > .${FOOTER_CLASS}`);
    if (!footer) {
      footer = document.createElement('div');
      footer.className = FOOTER_CLASS;
      panel.appendChild(footer);
    }

    if (reason.parentElement !== footer) footer.appendChild(reason);
    if (actions.parentElement !== footer) footer.appendChild(actions);
  }

  function enableTranscriptRuntime() {
    document.querySelectorAll(FRAME_SELECTOR).forEach((frame) => {
      if (
        frame.dataset.safeTranscriptRuntime === '1'
        && frame.getAttribute('sandbox') === 'allow-scripts'
      ) {
        return;
      }

      if (frame.getAttribute('sandbox') === 'allow-scripts') {
        frame.dataset.safeTranscriptRuntime = '1';
        return;
      }

      // The legacy inline renderer creates an empty sandbox. Replace the frame
      // before navigation completes so only the sanitized Discord component
      // runtime can execute, while same-origin access remains unavailable.
      const replacement = frame.cloneNode(false);
      replacement.setAttribute('sandbox', 'allow-scripts');
      replacement.dataset.safeTranscriptRuntime = '1';
      frame.replaceWith(replacement);
    });
  }

  function normalizeTranscriptUi() {
    arrangeMetadataFooter();
    enableTranscriptRuntime();
  }

  function init() {
    installStyles();
    normalizeTranscriptUi();

    const view = document.getElementById('view-transcripts');
    if (view) {
      new MutationObserver(() => {
        window.requestAnimationFrame(normalizeTranscriptUi);
      }).observe(view, { childList: true, subtree: true });
    }

    document.querySelector('.nav-item[data-target="view-transcripts"]')?.addEventListener('click', () => {
      window.setTimeout(normalizeTranscriptUi, 0);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
