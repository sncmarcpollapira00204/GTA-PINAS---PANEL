(() => {
  'use strict';

  const ROOT_ID = 'view-donation-embed-editor';
  const STYLE_ID = 'gta-donation-editor-enhancements';
  let bootTimer = null;
  let boundRoot = null;

  const normalizeColor = (value) => {
    const raw = String(value ?? '').trim();
    if (/^#[0-9a-f]{6}$/i.test(raw)) return raw.toUpperCase();
    if (/^\d+$/.test(raw)) {
      const number = Number(raw);
      if (Number.isSafeInteger(number) && number >= 0 && number <= 0xFFFFFF) {
        return `#${number.toString(16).padStart(6, '0').toUpperCase()}`;
      }
    }
    return '#2563EB';
  };

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${ROOT_ID} .gta-dee-link{display:flex;align-items:flex-end;gap:8px}
      #${ROOT_ID} .gta-dee-link .gta-dee-field{flex:1 1 auto;min-width:0}
      #${ROOT_ID} .gta-dee-link .gta-dee-field>input{height:40px;padding-top:0;padding-bottom:0;box-sizing:border-box}
      #${ROOT_ID} .gta-dee-link button{flex:0 0 auto;height:40px;min-width:110px;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;padding:0 14px}
      #${ROOT_ID} .gta-dee-color-control{display:flex;align-items:center;gap:8px;width:100%}
      #${ROOT_ID} .gta-dee-color-text{flex:1 1 auto;min-width:0;height:40px!important;box-sizing:border-box}
      #${ROOT_ID} .gta-dee-color-picker{width:40px!important;height:40px!important;flex:0 0 40px;padding:3px!important;border-radius:7px!important;cursor:pointer;background:var(--bg-main)!important;box-sizing:border-box}
      #${ROOT_ID} .gta-dee-color-picker::-webkit-color-swatch-wrapper{padding:0}
      #${ROOT_ID} .gta-dee-color-picker::-webkit-color-swatch,#${ROOT_ID} .gta-dee-color-picker::-moz-color-swatch{border:0;border-radius:4px}
      #${ROOT_ID} #dee-preview .gta-preview-description{font-size:11px;line-height:1.55;color:#dbdee1;overflow-wrap:anywhere}
    `;
    document.head.appendChild(style);
  }

  function syncColorControls(color, render = true) {
    const normalized = normalizeColor(color);
    const text = document.getElementById('dee-color');
    const picker = document.getElementById('dee-color-picker');
    if (text && text.value !== normalized) text.value = normalized;
    if (picker && picker.value !== normalized) picker.value = normalized;
    if (render) window.openDonationEmbedEditor?.();
  }

  function enhanceColorControl(root) {
    const text = root.querySelector('#dee-color');
    const field = text?.closest('.gta-dee-field');
    if (!field || !text || root.querySelector('#dee-color-picker')) return;

    text.classList.add('gta-dee-color-text');
    const control = document.createElement('div');
    control.className = 'gta-dee-color-control';
    text.parentNode.insertBefore(control, text);
    control.appendChild(text);

    const picker = document.createElement('input');
    picker.type = 'color';
    picker.id = 'dee-color-picker';
    picker.className = 'gta-dee-color-picker';
    picker.value = normalizeColor(text.value);
    control.appendChild(picker);

    text.addEventListener('input', () => {
      const raw = String(text.value || '').trim();
      if (/^#[0-9a-f]{6}$/i.test(raw) || /^\d+$/.test(raw)) syncColorControls(raw);
    });
    text.addEventListener('blur', () => syncColorControls(text.value));
    picker.addEventListener('input', () => syncColorControls(picker.value));
    picker.addEventListener('change', () => syncColorControls(picker.value));
    syncColorControls(text.value, false);
  }

  function bindRoot(root) {
    if (boundRoot === root) return;
    boundRoot = root;
    enhanceColorControl(root);
  }

  function boot() {
    installStyles();
    const root = document.getElementById(ROOT_ID);
    if (root) {
      bindRoot(root);
      return;
    }
    clearTimeout(bootTimer);
    bootTimer = setTimeout(boot, 100);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();