'use strict';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@127.0.0.1:5432/test';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isAllowedTranscriptUrl,
  transcriptMetadata,
} = require('../services/transcriptImportShared.service');
const {
  countUnresolvedLegacyFiles,
  discoverTranscriptEntries,
  transcriptCandidatesFromMessage,
} = require('../services/categoryTranscriptImport.service');

test('only Discord CDN HTML attachments are accepted as transcript downloads', () => {
  assert.equal(
    isAllowedTranscriptUrl(
      'https://cdn.discordapp.com/attachments/153/154/transcript-ticket-1008.html?ex=abc&is=def'
    ),
    true
  );
  assert.equal(
    isAllowedTranscriptUrl(
      'https://media.discordapp.net/attachments/153/154/transcript-ticket-1008.html?width=1000'
    ),
    true
  );

  assert.equal(isAllowedTranscriptUrl('http://cdn.discordapp.com/attachments/1/2/a.html'), false);
  assert.equal(isAllowedTranscriptUrl('https://example.com/attachments/1/2/a.html'), false);
  assert.equal(isAllowedTranscriptUrl('https://cdn.discordapp.com.evil.example/attachments/1/2/a.html'), false);
  assert.equal(isAllowedTranscriptUrl('https://cdn.discordapp.com/not-attachments/a.html'), false);
  assert.equal(isAllowedTranscriptUrl('https://discord.com/channels/1/2/3'), false);
  assert.equal(isAllowedTranscriptUrl('https://cdn.discordapp.com/attachments/1/2/a.txt'), false);
});

test('candidate discovery ignores arbitrary HTML links from message content', () => {
  const message = {
    id: '1530000000000000001',
    content: [
      'https://example.com/steal.html',
      'https://cdn.discordapp.com/attachments/1/2/transcript-safe.html?sig=1',
    ].join(' '),
    attachments: [],
    embeds: [],
    components: [],
  };

  const candidates = transcriptCandidatesFromMessage(message);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].name, 'transcript-safe.html');
});

test('summary discovery correlates a transcript by its Discord message link even when not adjacent', () => {
  const attachmentMessage = {
    id: '1530000000000000100',
    createdTimestamp: 1000,
    content: '',
    attachments: [
      {
        id: '1530000000000000101',
        name: 'transcript-lupin-ticket-1007.html',
        url: 'https://cdn.discordapp.com/attachments/1/2/transcript-lupin-ticket-1007.html?sig=1',
        size: 7000,
      },
    ],
    embeds: [],
    components: [],
  };

  const filler = Array.from({ length: 20 }, (_, index) => ({
    id: String(1530000000000000200n + BigInt(index)),
    createdTimestamp: 2000 + index,
    content: 'filler',
    attachments: [],
    embeds: [],
    components: [],
  }));

  const summaryMessage = {
    id: '1530000000000000300',
    createdTimestamp: 5000,
    content: '',
    attachments: [],
    embeds: [
      {
        fields: [
          { name: 'Ticket Owner', value: '<@735045975378362401>' },
          { name: 'Ticket Name', value: 'lupin-ticket-1007' },
          { name: 'Panel Name', value: 'REPORT' },
          { name: 'Closed By', value: '<@735045975378362401>' },
        ],
      },
    ],
    components: [
      {
        components: [
          {
            url: 'https://discord.com/channels/150000000000000000/1531051567661453422/1530000000000000100',
          },
        ],
      },
    ],
  };

  const entries = discoverTranscriptEntries([attachmentMessage, ...filler, summaryMessage]);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].summaryMessage.id, summaryMessage.id);
});

test('legacy Components V2 file cards are reported when Discord hides attachment metadata', () => {
  const messages = [
    {
      id: '1530000000000000400',
      attachments: [],
      embeds: [],
      components: [
        {
          type: 13,
          file: { url: 'attachment://transcript-ticket-1008.html' },
        },
      ],
    },
  ];

  assert.equal(countUnresolvedLegacyFiles(messages), 1);
});

test('transcript metadata prefers summary embed fields and keeps filename fallback', () => {
  const entry = {
    attachmentMessage: {
      id: '1530000000000000500',
      embeds: [],
    },
    summaryMessage: {
      id: '1530000000000000501',
      embeds: [
        {
          fields: [
            { name: 'Ticket Owner', value: '<@735045975378362401>' },
            { name: 'Ticket Name', value: 'lupin-ticket-1007' },
            { name: 'Panel Name', value: 'REPORT' },
            { name: 'Closed By', value: '<@735045975378362401>' },
          ],
        },
      ],
    },
    attachment: {
      name: 'transcript-lupin-ticket-1007.html',
      url: 'https://cdn.discordapp.com/attachments/1/2/transcript-lupin-ticket-1007.html',
    },
  };

  const metadata = transcriptMetadata(entry);
  assert.equal(metadata.ownerId, '735045975378362401');
  assert.equal(metadata.closedById, '735045975378362401');
  assert.equal(metadata.ticketName, 'lupin-ticket-1007');
  assert.equal(metadata.ticketNumber, '1007');
  assert.equal(metadata.panelName, 'REPORT');
});
