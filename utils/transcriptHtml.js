'use strict';

const TRANSCRIPT_COMPONENT_SRC = 'https://cdn.jsdelivr.net/npm/@derockdev/discord-components-core@3.6.1/dist/derockdev-discord-components-core/derockdev-discord-components-core.esm.js';

function extractDiscordTranscriptState(input) {
  const html = String(input || '');
  const scripts = /<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi;
  let match;

  while ((match = scripts.exec(html))) {
    const body = String(match[1] || '').trim();
    const assignment = body.match(/^(?:window\.)?\$discordMessage\s*=\s*([\s\S]*?)\s*;?\s*$/);
    if (!assignment) continue;

    try {
      const parsed = JSON.parse(assignment[1]);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch (_) {
      // Ignore malformed or unexpected inline scripts.
    }
  }

  return { profiles: {} };
}

function sanitizeTranscriptHtml(input) {
  return String(input || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<(?:iframe|object|embed|form)\b[^>]*>[\s\S]*?<\/(?:iframe|object|embed|form)\s*>/gi, '')
    .replace(/<(?:iframe|object|embed|form)\b[^>]*\/?>/gi, '')
    .replace(/<meta\b[^>]*http-equiv\s*=\s*(["'])?refresh\1?[^>]*>/gi, '')
    .replace(/<base\b[^>]*>/gi, '')
    .replace(/\s+on[a-z0-9_-]+\s*=\s*(["'])[\s\S]*?\1/gi, '')
    .replace(/\s+on[a-z0-9_-]+\s*=\s*[^\s>]+/gi, '')
    .replace(/(href|src|xlink:href)\s*=\s*(["'])\s*javascript:[\s\S]*?\2/gi, '$1="#"');
}

function serializeForInlineScript(value) {
  return JSON.stringify(value || { profiles: {} })
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function safeNonce(value) {
  return String(value || '').replace(/[^a-zA-Z0-9+/_=-]/g, '');
}

function buildSafeTranscriptHtml(input, nonce, stateOverride = null) {
  const state = stateOverride && typeof stateOverride === 'object'
    ? stateOverride
    : extractDiscordTranscriptState(input);
  const html = sanitizeTranscriptHtml(input);
  const normalizedNonce = safeNonce(nonce);
  const nonceAttribute = normalizedNonce ? ` nonce="${normalizedNonce}"` : '';
  const runtime = [
    `<script${nonceAttribute}>window.$discordMessage=${serializeForInlineScript(state)};</script>`,
    `<script${nonceAttribute} type="module" src="${TRANSCRIPT_COMPONENT_SRC}"></script>`,
  ].join('');

  if (/<\/head\s*>/i.test(html)) return html.replace(/<\/head\s*>/i, `${runtime}</head>`);
  return `<!doctype html><html><head><meta charset="utf-8">${runtime}</head><body>${html}</body></html>`;
}

module.exports = {
  TRANSCRIPT_COMPONENT_SRC,
  extractDiscordTranscriptState,
  sanitizeTranscriptHtml,
  serializeForInlineScript,
  buildSafeTranscriptHtml,
};
