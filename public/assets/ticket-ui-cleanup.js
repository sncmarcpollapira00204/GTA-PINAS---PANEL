'use strict';

(() => {
  let ticketObserver = null;
  let brandingObserver = null;
  let panelObserver = null;

  function installStyles() {
    if (document.getElementById('ticket-ui-cleanup-styles')) return;

    const style = document.createElement('style');
    style.id = 'ticket-ui-cleanup-styles';
    style.textContent = `
      #view-open-tickets .table-container,
      #view-closed-tickets .table-container {
        border-radius: 10px;
        box-shadow: none;
      }

      #view-open-tickets .table-container:hover,
      #view-closed-tickets .table-container:hover {
        transform: none;
        box-shadow: none;
      }

      #view-open-tickets table,
      #view-closed-tickets table {
        table-layout: auto;
      }

      #view-open-tickets th,
      #view-open-tickets td,
      #view-closed-tickets th,
      #view-closed-tickets td {
        padding: 13px 16px;
      }

      #view-open-tickets th,
      #view-closed-tickets th {
        font-size: 10px;
        letter-spacing: .04em;
        background: transparent;
      }

      #view-open-tickets tbody tr,
      #view-closed-tickets tbody tr {
        transform: none !important;
      }

      #view-open-tickets tbody tr:hover,
      #view-closed-tickets tbody tr:hover {
        background: rgba(255,255,255,.025);
        transform: none !important;
      }

      #view-open-tickets .btn,
      #view-closed-tickets .btn {
        min-height: 32px;
        padding: 6px 11px !important;
        border-radius: 7px;
      }

      #view-open-tickets .user-cell,
      #view-closed-tickets .user-cell {
        gap: 10px;
      }

      #view-open-tickets .user-cell .name,
      #view-closed-tickets .user-cell .name {
        font-weight: 600;
      }

      @media (max-width: 760px) {
        #view-open-tickets th,
        #view-open-tickets td,
        #view-closed-tickets th,
        #view-closed-tickets td {
          padding: 11px 12px;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function applyGtaPinasBranding(root = document) {
    const BRAND_REPLACEMENTS = [
      ['5th Avenue Roleplay', 'GTA Pinas Roleplay'],
      ['5th Avenue Web Panel', 'GTA Pinas Web Panel'],
      ['5TH AVENUE ROLEPLAY', 'GTA PINAS ROLEPLAY'],
      ['5TH AVENUE', 'GTA PINAS'],
    ];

    const walker = document.createTreeWalker(root.body || root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let node;
    while ((node = walker.nextNode())) nodes.push(node);

    nodes.forEach((textNode) => {
      const parent = textNode.parentElement;
      if (!parent || /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA)$/.test(parent.tagName)) return;

      let text = textNode.nodeValue || '';
      let next = text;
      BRAND_REPLACEMENTS.forEach(([from, to]) => {
        next = next.split(from).join(to);
      });
      if (next !== text) textNode.nodeValue = next;
    });

    document.title = 'GTA Pinas Roleplay Panel';

    root.querySelectorAll('img.logo, .sidebar-header img, img[alt*="5th" i]').forEach((img) => {
      const src = img.getAttribute('src') || '';
      if (src !== '/assets/gta-pinas-logo.svg') {
        img.setAttribute('src', '/assets/gta-pinas-logo.svg');
      }
      img.setAttribute('alt', 'GTA Pinas Roleplay');
      img.removeAttribute('srcset');
    });
  }

  function hideManageStaffMenuItem() {
    const management = document.querySelector('#nav-management-menu');
    if (!management) return;

    management.querySelectorAll('*').forEach((el) => {
      if (el.dataset.gtaPinasHidden === 'true') return;

      const label = String(el.textContent || '').replace(/\s+/g, ' ').trim();
      if (label !== 'Manage Staff') return;

      const target = el.closest('a, button, li, [role="menuitem"], .nav-item, .sidebar-item');
      if (target && target !== management) {
        target.style.setProperty('display', 'none', 'important');
        target.dataset.gtaPinasHidden = 'true';
      }
    });
  }

  function removeWhitelistAndPerformanceUI() {
    const selectors = [
      '#nav-whitelist-menu',
      '[data-nav-group="whitelist"]',
      '#view-whitelist-check',
      '#view-whitelist-pending',
      '#view-whitelist-approved',
      '#view-staff-performance',
      '[data-target="view-staff-performance"]',
      '[data-target="view-whitelist-check"]',
      '[data-target="view-whitelist-pending"]',
      '[data-target="view-whitelist-approved"]',
    ];

    selectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((el) => el.remove());
    });

    document.querySelectorAll('.dashboard-stat-card').forEach((card) => {
      const text = String(card.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (text.includes('pending whitelist') || text.includes('whitelisted') || text.includes('total management team')) {
        card.remove();
      }
    });

    document.querySelectorAll('.nav-item, .nav-dropdown-toggle, .nav-dropdown').forEach((el) => {
      const text = String(el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (text === 'staff performance' || text === 'whitelist' || text === 'check voucher' || text === 'pending whitelist' || text === 'whitelisted') {
        const target = el.closest('.nav-dropdown, .nav-item, li') || el;
        target.remove();
      }
    });
  }

  function observeBranding() {
    if (brandingObserver) return;
    brandingObserver = new MutationObserver(() => {
      applyGtaPinasBranding(document);
      hideManageStaffMenuItem();
    });
    brandingObserver.observe(document.body, { childList: true, subtree: true });
  }

  function observePanelCleanup() {
    if (panelObserver) return;
    panelObserver = new MutationObserver(() => {
      removeWhitelistAndPerformanceUI();
    });
    panelObserver.observe(document.body, { childList: true, subtree: true });
  }

  function removePriorityColumn() {
    const table = document.querySelector('#view-open-tickets table');
    if (!table) return;

    const headerRow = table.tHead?.rows?.[0];
    if (headerRow && !headerRow.dataset.priorityRemoved) {
      const priorityHeader = Array.from(headerRow.cells).find((cell) =>
        String(cell.textContent || '').trim().toLowerCase() === 'priority'
      );
      priorityHeader?.remove();
      headerRow.dataset.priorityRemoved = 'true';
    }

    const body = table.tBodies?.[0];
    if (!body) return;

    Array.from(body.rows).forEach((row) => {
      if (row.dataset.priorityRemoved) return;

      if (row.cells.length >= 7) {
        row.cells[3]?.remove();
      } else if (row.cells.length === 1 && Number(row.cells[0].colSpan) === 7) {
        row.cells[0].colSpan = 6;
      }

      row.dataset.priorityRemoved = 'true';
    });
  }

  function observeTicketRows() {
    const body = document.querySelector('#view-open-tickets tbody');
    if (!body || ticketObserver) return;

    ticketObserver = new MutationObserver(removePriorityColumn);
    ticketObserver.observe(body, { childList: true });
  }

  function init() {
    installStyles();
    applyGtaPinasBranding(document);
    hideManageStaffMenuItem();
    removeWhitelistAndPerformanceUI();
    observeBranding();
    observePanelCleanup();
    removePriorityColumn();
    observeTicketRows();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
