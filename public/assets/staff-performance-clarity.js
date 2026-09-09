'use strict';

(() => {
  function applyStaticLabels() {
    const view = document.getElementById('view-staff-performance');
    if (!view) return;

    const description = view.querySelector('.page-header p');
    if (description) {
      description.textContent = 'Unique approved whitelist records and closed tickets credited to registered staff.';
    }

    const summaryLabels = view.querySelectorAll('.performance-summary-card span');
    if (summaryLabels[1]) summaryLabels[1].textContent = 'Whitelist Credits';
    if (summaryLabels[2]) summaryLabels[2].textContent = 'Closed Tickets Handled';

    const headingNote = view.querySelector('.performance-list-heading > div > span');
    if (headingNote) {
      headingNote.textContent = 'Official hierarchy. Total Activity = Whitelist Approved + Tickets Handled.';
    }

    const headers = view.querySelectorAll('.performance-table th');
    if (headers[3]) headers[3].title = 'One approved whitelist record is credited to at most one registered staff member.';
    if (headers[4]) headers[4].title = 'Only closed tickets are counted, with one final handler per ticket.';
    if (headers[5]) headers[5].title = 'Whitelist Approved plus Tickets Handled.';
  }

  const originalRender = window.renderStaffPerformance;
  if (typeof originalRender === 'function') {
    window.renderStaffPerformance = function renderAccurateStaffPerformance(payload) {
      originalRender(payload);
      applyStaticLabels();

      const accuracy = payload?.accuracy || {};
      const whitelistCard = document.getElementById('performance-total-whitelist')?.closest('.performance-summary-card');
      const ticketCard = document.getElementById('performance-total-tickets')?.closest('.performance-summary-card');

      if (whitelistCard) {
        whitelistCard.title = [
          `Database approved records: ${Number(accuracy.databaseApprovedWhitelistRecords || 0).toLocaleString()}`,
          `Unattributed records: ${Number(accuracy.unattributedWhitelistRecords || 0).toLocaleString()}`,
        ].join(' · ');
      }
      if (ticketCard) {
        ticketCard.title = [
          `Database closed tickets: ${Number(accuracy.databaseClosedTickets || 0).toLocaleString()}`,
          `Unattributed tickets: ${Number(accuracy.unattributedClosedTickets || 0).toLocaleString()}`,
        ].join(' · ');
      }
    };
  }

  window.loadStaffPerformance = async function loadAccurateStaffPerformance({ force = false } = {}) {
    if (typeof staffPerformanceAccessEnabled !== 'undefined' && !staffPerformanceAccessEnabled) {
      window.showToast?.('You do not have access to Staff Performance.', 'error');
      return;
    }
    if (typeof staffPerformanceLoaded !== 'undefined' && staffPerformanceLoaded && !force) return;

    const body = document.getElementById('staff-performance-body');
    if (body) {
      body.innerHTML = '<tr><td colspan="6" class="performance-empty"><i data-lucide="loader-circle" class="spin" size="17"></i> Recalculating staff performance...</td></tr>';
    }
    window.renderPanelIcons?.({ root: body || document });

    try {
      const endpoint = force ? '/api/staff/performance?refresh=1' : '/api/staff/performance';
      const response = await fetch(endpoint, { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to load staff performance.');

      window.renderStaffPerformance?.(payload);
      if (typeof staffPerformanceLoaded !== 'undefined') staffPerformanceLoaded = true;
      if (force) window.showToast?.('Staff performance recalculated from the databases.', 'success');
    } catch (error) {
      if (body) {
        const message = typeof escapeHTML === 'function'
          ? escapeHTML(error.message || 'Unable to load report.')
          : 'Unable to load report.';
        body.innerHTML = `<tr><td colspan="6" class="performance-empty">${message}</td></tr>`;
      }
      window.showToast?.(error.message || 'Unable to load staff performance.', 'error');
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyStaticLabels, { once: true });
  } else {
    applyStaticLabels();
  }
})();
