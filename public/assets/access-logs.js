'use strict';

(() => {
  const CORE_SRC = '/assets/access-logs-core.js';
  let panelModeratorAccess = false;

  function applyGTAPinasBranding() {
    document.title = 'GTA Pinas Roleplay Panel';

    document.querySelectorAll('.brand-copy h2').forEach((element) => {
      if (element.textContent.trim() === '5th Avenue') element.textContent = 'GTA Pinas';
    });

    document.querySelectorAll('.brand-mark').forEach((element) => {
      element.setAttribute('aria-label', 'GTA Pinas');
      const image = element.querySelector('img');
      if (image) image.alt = 'GTA Pinas logo';
      const fallback = element.querySelector('span[aria-hidden="true"]');
      if (fallback && fallback.textContent.trim() === '5') fallback.textContent = 'G';
    });

    document.querySelectorAll('.server-identity strong').forEach((element) => {
      if (element.textContent.trim() === '5th Avenue Roleplay') element.textContent = 'GTA Pinas Roleplay';
    });

    document.querySelectorAll('.watermark').forEach((element) => {
      if (element.textContent.trim() === '5th Avenue Roleplay') element.textContent = 'GTA Pinas Roleplay';
    });
  }

  function loadCore() {
    if (window.__accessLogsCoreLoaded || document.querySelector(`script[src="${CORE_SRC}"]`)) return;
    window.__accessLogsCoreLoaded = true;
    const script = document.createElement('script');
    script.src = CORE_SRC;
    script.async = false;
    document.body.appendChild(script);
  }

  async function loadPanelModeratorAccess() {
    try {
      const response = await fetch('/api/auth/me', { headers: { Accept: 'application/json' }, cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json();
      panelModeratorAccess = data?.permissions?.staffManagement === true || data?.permissions?.accessLogs === true;
    } catch (_) {
      panelModeratorAccess = false;
    }
  }

  function exposeAccessLogsNavigation() {
    document.querySelectorAll('[data-target="view-access-logs"]').forEach((element) => {
      element.hidden = false;
      element.removeAttribute('data-owner-only');
    });

    const view = document.getElementById('view-access-logs');
    if (view) {
      view.hidden = false;
      view.removeAttribute('data-owner-only');
    }
  }

  function installRestrictedManagementGuard() {
    if (window.__panelModeratorManagementGuardInstalled) return;
    window.__panelModeratorManagementGuardInstalled = true;

    document.addEventListener('click', (event) => {
      const element = event.target?.closest?.('a,button,[data-target]');
      if (!element || panelModeratorAccess) return;

      const label = String(
        element.getAttribute('title') ||
        element.textContent ||
        element.getAttribute('aria-label') ||
        ''
      ).replace(/\s+/g, ' ').trim().toLowerCase();

      if (label.includes('manage staff') || label.includes('staff management')) {
        event.preventDefault();
        event.stopPropagation();
        if (typeof window.showToast === 'function') {
          window.showToast('Only Panel Moderator can access this.', 'error');
        } else {
          window.alert('Only Panel Moderator can access this.');
        }
      }
    }, true);
  }

  function installSidebarLayout() {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return false;

    let scroll = sidebar.querySelector(':scope > .sidebar-nav-scroll');
    const navLinks = sidebar.querySelector(':scope > .nav-links');
    const management = sidebar.querySelector(':scope > .nav-dropdown[data-nav-group="management"]');
    const footer = sidebar.querySelector(':scope > .sidebar-bottom');

    if (!navLinks || !management || !footer) return false;

    if (!scroll) {
      scroll = document.createElement('div');
      scroll.className = 'sidebar-nav-scroll';
      sidebar.insertBefore(scroll, footer);
    }

    if (navLinks.parentElement !== scroll) scroll.appendChild(navLinks);
    if (management.parentElement !== scroll) scroll.appendChild(management);

    if (!document.getElementById('sidebar-layout-fix-styles')) {
      const style = document.createElement('style');
      style.id = 'sidebar-layout-fix-styles';
      style.textContent = `
        .sidebar {
          display:flex!important;
          flex-direction:column!important;
          width:var(--sidebar-width)!important;
          height:100vh!important;
          min-height:0!important;
          overflow:hidden!important;
          flex:0 0 var(--sidebar-width)!important;
        }
        .sidebar-header { flex:0 0 auto!important; min-width:0!important; }
        .sidebar-nav-scroll {
          flex:1 1 auto!important;
          min-height:0!important;
          min-width:0!important;
          overflow-x:hidden!important;
          overflow-y:auto!important;
          overscroll-behavior:contain;
          scrollbar-gutter:stable;
          padding:12px 16px 8px!important;
          display:flex!important;
          flex-direction:column!important;
          gap:0!important;
        }
        .sidebar-nav-scroll .nav-links {
          flex:0 0 auto!important;
          min-height:0!important;
          width:100%!important;
          padding:0!important;
          margin:0!important;
          overflow:visible!important;
          gap:8px!important;
        }
        .sidebar-nav-scroll > .nav-dropdown[data-nav-group="management"] {
          flex:0 0 auto!important;
          width:100%!important;
          margin:8px 0 0!important;
        }
        .sidebar-bottom {
          flex:0 0 auto!important;
          min-width:0!important;
          margin-top:0!important;
        }
        .main-wrapper {
          flex:1 1 auto!important;
          min-width:0!important;
          max-width:none!important;
        }
        .content-area {
          flex:1 1 auto!important;
          min-width:0!important;
          width:auto!important;
          max-width:none!important;
          min-height:0!important;
          margin:0!important;
          overflow-x:hidden!important;
        }
        .view-section,
        .view-section.active,
        .page-header,
        .page-header > div,
        .card,
        .table-container,
        .settings-shell,
        .stats-grid,
        .dashboard-stats-grid { min-width:0!important; max-width:100%!important; }
        .page-header h1,
        .page-header p { overflow-wrap:anywhere; }
        .stats-grid,
        .dashboard-stats-grid {
          grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr))!important;
        }
        @media(max-width:900px) {
          .sidebar {
            width:min(380px,calc(100vw - 18px))!important;
            max-width:calc(100vw - 18px)!important;
            flex:0 0 auto!important;
          }
          .sidebar-nav-scroll {
            padding:12px!important;
            gap:0!important;
          }
          .sidebar-nav-scroll .nav-links {
            gap:6px!important;
          }
          .sidebar-nav-scroll > .nav-dropdown[data-nav-group="management"] {
            margin-top:6px!important;
          }
          .content-area {
            width:100%!important;
            max-width:100%!important;
            overflow-x:hidden!important;
          }
        }
      `;
      document.head.appendChild(style);
    }

    return true;
  }

  function boot() {
    loadCore();
    loadPanelModeratorAccess();
    applyGTAPinasBranding();
    exposeAccessLogsNavigation();
    installRestrictedManagementGuard();
    installSidebarLayout();

    if (document.body) {
      const observer = new MutationObserver(() => {
        applyGTAPinasBranding();
        exposeAccessLogsNavigation();
        installSidebarLayout();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
