'use strict';

(() => {
  const STORAGE_KEY = '5A_TRANSCRIPT_METADATA_COLLAPSED';
  const PANEL_CLASS = 'transcript-meta-fixed';
  const WORKSPACE_CLASS = 'transcript-workspace-fixed';
  const COLLAPSED_CLASS = 'meta-fixed-collapsed';

  function renderIcons(root = document) {
    if (typeof window.renderPanelIcons === 'function') {
      window.renderPanelIcons({ root, immediate: true });
      return;
    }
    if (window.lucide) window.lucide.createIcons();
  }

  function installStyles() {
    if (document.getElementById('transcript-collapse-fix-styles')) return;

    const style = document.createElement('style');
    style.id = 'transcript-collapse-fix-styles';
    style.textContent = `
      #view-transcripts .transcript-workspace.${WORKSPACE_CLASS}{
        width:100%!important;
        max-width:none!important;
        min-width:0!important;
        display:grid!important;
        grid-template-columns:minmax(250px,292px) minmax(0,1fr) 270px!important;
        align-items:stretch!important;
        justify-content:stretch!important;
        gap:12px!important;
        transition:grid-template-columns .20s ease!important;
      }
      #view-transcripts .transcript-workspace.${WORKSPACE_CLASS}.${COLLAPSED_CLASS}{
        grid-template-columns:minmax(250px,292px) minmax(0,1fr) 48px!important;
      }

      #view-transcripts .transcript-workspace.${WORKSPACE_CLASS}>.transcript-browser{
        grid-column:1!important;
        width:100%!important;
        min-width:0!important;
      }
      #view-transcripts .transcript-workspace.${WORKSPACE_CLASS}>.transcript-viewer{
        grid-column:2!important;
        width:100%!important;
        min-width:0!important;
        max-width:none!important;
        justify-self:stretch!important;
        transition:width .20s ease!important;
      }

      /* The metadata column is anchored to the far-right edge. When it
         collapses, only the right column shrinks and the transcript viewer
         automatically receives the released width. */
      #view-transcripts #transcript-meta-panel.${PANEL_CLASS}{
        display:flex!important;
        flex-direction:column!important;
        grid-column:3!important;
        grid-row:1!important;
        width:100%!important;
        min-width:0!important;
        max-width:none!important;
        height:100%!important;
        min-height:0!important;
        max-height:none!important;
        align-self:stretch!important;
        justify-self:end!important;
        overflow:hidden!important;
        padding:0!important;
        border-radius:10px!important;
        transform-origin:right center!important;
      }
      #view-transcripts #transcript-meta-panel.${PANEL_CLASS}.${COLLAPSED_CLASS}{
        width:48px!important;
        min-width:48px!important;
        height:100%!important;
        align-self:stretch!important;
        justify-self:end!important;
        padding:0!important;
      }

      #view-transcripts #transcript-meta-panel.${PANEL_CLASS} .transcript-meta-heading{
        flex:0 0 55px!important;
        min-height:55px!important;
        height:55px!important;
        margin:0!important;
        padding:0 12px!important;
        display:flex!important;
        align-items:center!important;
        justify-content:space-between!important;
        gap:8px!important;
        border-bottom:1px solid var(--border)!important;
        cursor:default!important;
      }
      #view-transcripts #transcript-meta-panel.${PANEL_CLASS} .transcript-meta-list{
        flex:0 0 auto!important;
        margin:0!important;
      }
      #view-transcripts #transcript-meta-panel.${PANEL_CLASS} .transcript-meta-reason{
        flex:0 0 auto!important;
      }
      #view-transcripts #transcript-meta-panel.${PANEL_CLASS} .transcript-meta-actions{
        flex:0 0 auto!important;
        margin-top:auto!important;
      }

      #view-transcripts .transcript-meta-toggle-fixed{
        width:30px!important;
        height:30px!important;
        min-width:30px!important;
        min-height:30px!important;
        margin-left:auto!important;
        padding:0!important;
        display:grid!important;
        place-items:center!important;
        flex:0 0 30px!important;
        border:1px solid var(--border)!important;
        border-radius:7px!important;
        background:var(--bg-main)!important;
        color:var(--text-sec)!important;
        cursor:pointer!important;
      }
      #view-transcripts .transcript-meta-toggle-fixed:hover{
        color:var(--text-main)!important;
        border-color:var(--border-light)!important;
        background:var(--bg-card-hover)!important;
      }

      #view-transcripts #transcript-meta-panel.${PANEL_CLASS}.${COLLAPSED_CLASS} .transcript-meta-heading{
        flex:1 1 auto!important;
        width:48px!important;
        min-width:48px!important;
        height:100%!important;
        min-height:100%!important;
        margin:0!important;
        padding:8px 0!important;
        align-items:flex-start!important;
        justify-content:center!important;
        border:0!important;
      }
      #view-transcripts #transcript-meta-panel.${PANEL_CLASS}.${COLLAPSED_CLASS} .transcript-meta-heading>div,
      #view-transcripts #transcript-meta-panel.${PANEL_CLASS}.${COLLAPSED_CLASS} .transcript-meta-list,
      #view-transcripts #transcript-meta-panel.${PANEL_CLASS}.${COLLAPSED_CLASS} .transcript-meta-reason,
      #view-transcripts #transcript-meta-panel.${PANEL_CLASS}.${COLLAPSED_CLASS} .transcript-meta-actions{
        display:none!important;
      }
      #view-transcripts #transcript-meta-panel.${PANEL_CLASS}.${COLLAPSED_CLASS} .transcript-meta-toggle-fixed{
        position:sticky!important;
        top:8px!important;
        margin:0!important;
      }

      @media(max-width:1320px) and (min-width:901px){
        #view-transcripts .transcript-workspace.${WORKSPACE_CLASS}{
          grid-template-columns:minmax(230px,260px) minmax(0,1fr) 238px!important;
        }
        #view-transcripts .transcript-workspace.${WORKSPACE_CLASS}.${COLLAPSED_CLASS}{
          grid-template-columns:minmax(230px,260px) minmax(0,1fr) 48px!important;
        }
      }

      @media(max-width:1080px) and (min-width:901px){
        #view-transcripts .transcript-workspace.${WORKSPACE_CLASS}{
          grid-template-columns:220px minmax(0,1fr) 220px!important;
        }
        #view-transcripts .transcript-workspace.${WORKSPACE_CLASS}.${COLLAPSED_CLASS}{
          grid-template-columns:220px minmax(0,1fr) 48px!important;
        }
      }

      @media(max-width:900px){
        #view-transcripts .transcript-workspace.${WORKSPACE_CLASS},
        #view-transcripts .transcript-workspace.${WORKSPACE_CLASS}.${COLLAPSED_CLASS}{
          grid-template-columns:1fr!important;
        }
        #view-transcripts .transcript-workspace.${WORKSPACE_CLASS}>.transcript-browser,
        #view-transcripts .transcript-workspace.${WORKSPACE_CLASS}>.transcript-viewer{
          grid-column:1!important;
        }
        #view-transcripts #transcript-meta-panel.${PANEL_CLASS}{
          position:fixed!important;
          top:58px!important;
          right:0!important;
          bottom:0!important;
          left:auto!important;
          z-index:80!important;
          width:min(330px,88vw)!important;
          height:auto!important;
          min-height:0!important;
          border-radius:12px 0 0 12px!important;
          box-shadow:-18px 0 42px rgba(0,0,0,.35)!important;
        }
        #view-transcripts #transcript-meta-panel.${PANEL_CLASS}.${COLLAPSED_CLASS}{
          width:48px!important;
          min-width:48px!important;
          height:calc(100dvh - 58px)!important;
        }
      }

      @media(prefers-reduced-motion:reduce){
        #view-transcripts .transcript-workspace.${WORKSPACE_CLASS},
        #view-transcripts .transcript-workspace.${WORKSPACE_CLASS}>.transcript-viewer{
          transition:none!important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function readCollapsedState() {
    try {
      return sessionStorage.getItem(STORAGE_KEY) === '1';
    } catch (_) {
      return false;
    }
  }

  function writeCollapsedState(collapsed) {
    try {
      sessionStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
    } catch (_) {}
  }

  function notifyLayoutChange(workspace) {
    window.requestAnimationFrame(() => {
      workspace.getBoundingClientRect();
      window.dispatchEvent(new Event('resize'));
    });
  }

  function normalizeTranscriptPanel() {
    const panel = document.getElementById('transcript-meta-panel');
    const workspace = panel?.closest('.transcript-workspace');
    const currentHeading = panel?.querySelector('.transcript-meta-heading');
    if (!panel || !workspace || !currentHeading) return;

    workspace.classList.add(WORKSPACE_CLASS);
    workspace.classList.remove('meta-right-collapsed');
    panel.classList.add(PANEL_CLASS, 'simple-meta-panel', 'right-meta-panel');
    panel.classList.remove('is-collapsed', 'is-right-collapsed');

    if (panel.dataset.fixedCollapseReady === '1') {
      panel.classList.remove('is-collapsed', 'is-right-collapsed');
      workspace.classList.remove('meta-right-collapsed');
      return;
    }

    const heading = currentHeading.cloneNode(true);
    heading.querySelectorAll('.simple-meta-toggle, .right-meta-toggle, .transcript-meta-toggle-fixed').forEach((node) => node.remove());
    currentHeading.replaceWith(heading);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'right-meta-toggle transcript-meta-toggle-fixed';
    heading.appendChild(button);

    const setCollapsed = (collapsed) => {
      panel.classList.remove('is-collapsed', 'is-right-collapsed');
      workspace.classList.remove('meta-right-collapsed');

      panel.classList.toggle(COLLAPSED_CLASS, collapsed);
      workspace.classList.toggle(COLLAPSED_CLASS, collapsed);
      workspace.dataset.metadataState = collapsed ? 'collapsed' : 'expanded';

      button.setAttribute('aria-expanded', String(!collapsed));
      button.setAttribute(
        'aria-label',
        collapsed ? 'Expand ticket metadata from the right' : 'Collapse ticket metadata to the right'
      );

      /* Expanded panel collapses toward the right edge. The collapsed rail
         expands back toward the transcript when clicked. */
      button.innerHTML = collapsed
        ? '<i data-lucide="chevrons-left" size="17"></i>'
        : '<i data-lucide="chevrons-right" size="17"></i>';

      writeCollapsedState(collapsed);
      renderIcons(button);
      notifyLayoutChange(workspace);
    };

    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      setCollapsed(!panel.classList.contains(COLLAPSED_CLASS));
    });

    panel.dataset.fixedCollapseReady = '1';
    setCollapsed(readCollapsedState());
  }

  function init() {
    installStyles();
    normalizeTranscriptPanel();

    const transcriptView = document.getElementById('view-transcripts');
    if (transcriptView) {
      new MutationObserver(() => {
        window.requestAnimationFrame(normalizeTranscriptPanel);
      }).observe(transcriptView, { childList: true, subtree: true });
    }

    document.querySelector('.nav-item[data-target="view-transcripts"]')?.addEventListener('click', () => {
      window.setTimeout(normalizeTranscriptPanel, 0);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
