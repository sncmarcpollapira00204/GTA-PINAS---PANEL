'use strict';

(() => {
  let ticketObserver = null;

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
    removePriorityColumn();
    observeTicketRows();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
