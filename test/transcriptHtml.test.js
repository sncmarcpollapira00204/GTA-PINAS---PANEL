'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  TRANSCRIPT_COMPONENT_SRC,
  extractDiscordTranscriptState,
  sanitizeTranscriptHtml,
  buildSafeTranscriptHtml,
} = require('../utils/transcriptHtml');

test('extracts only valid discord transcript JSON state', () => {
  const html = `
    <html><head>
      <script>alert('blocked')</script>
      <script>window.$discordMessage={"profiles":{"123":{"author":"Lupin"}}};</script>
    </head><body></body></html>
  `;

  assert.deepEqual(extractDiscordTranscriptState(html), {
    profiles: { 123: { author: 'Lupin' } },
  });
});

test('removes active untrusted transcript content', () => {
  const html = `
    <html><head><base href="https://evil.example/"><meta http-equiv="refresh" content="0"></head>
    <body onload="steal()">
      <script src="https://evil.example/payload.js"></script>
      <iframe src="https://evil.example"></iframe>
      <form action="https://evil.example"><input></form>
      <a href="javascript:steal()">unsafe</a>
      <discord-message>safe content</discord-message>
    </body></html>
  `;
  const sanitized = sanitizeTranscriptHtml(html);

  assert.doesNotMatch(sanitized, /<script/i);
  assert.doesNotMatch(sanitized, /<iframe/i);
  assert.doesNotMatch(sanitized, /<form/i);
  assert.doesNotMatch(sanitized, /onload=/i);
  assert.doesNotMatch(sanitized, /javascript:/i);
  assert.match(sanitized, /<discord-message>safe content<\/discord-message>/);
});

test('restores the pinned Discord component runtime with a nonce', () => {
  const html = `
    <!doctype html><html><head>
      <script>window.$discordMessage={"profiles":{"123":{"author":"Lupin <Admin> & Team"}}};</script>
      <script type="module" src="https://untrusted.example/runtime.js"></script>
    </head><body><discord-messages></discord-messages></body></html>
  `;
  const rendered = buildSafeTranscriptHtml(html, 'safeNonce123');

  assert.match(rendered, /nonce="safeNonce123"/);
  assert.match(rendered, new RegExp(TRANSCRIPT_COMPONENT_SRC.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(rendered, /untrusted\.example/);
  assert.match(rendered, /Lupin \\u003cAdmin\\u003e \\u0026 Team/);
});
