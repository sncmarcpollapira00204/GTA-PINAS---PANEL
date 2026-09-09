const {
  Client,
  GatewayIntentBits,
  Events,
  ChannelType,
  PermissionFlagsBits,
  OverwriteType,
} = require('discord.js');
const pool = require('../db');
const config = require('../config.json');

const MESSAGE_PAYLOAD_PREFIX = '5A_MSG_V2:';
// Current Gatekeeper transcript channels only
const transcriptChannelIds = new Set(
  Object.values(config.transcriptChannels || {}).filter(Boolean)
);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

let loginStarted = false;
let loginError = null;
let readyResolver;
const readyPromise = new Promise((resolve) => {
  readyResolver = resolve;
});

client.once(Events.ClientReady, () => {
  loginError = null;
  console.log(`[DISCORD IMPORT] Logged in as ${client.user.tag}. Manual recovery is ready.`);
  readyResolver(true);
});

client.on(Events.Error, (error) => {
  console.error('[DISCORD IMPORT CLIENT ERROR]', error.message);
});

function startDiscordLogin() {
  if (loginStarted) return;
  loginStarted = true;

  const token = process.env.DISCORD_TOKEN || process.env.TOKEN;
  if (!token) {
    loginError = new Error(
      'DISCORD_TOKEN is missing from the Web Panel Railway variables.'
    );
    readyResolver(false);
    return;
  }

  client.login(token).catch((error) => {
    loginError = error;
    console.error('[DISCORD IMPORT LOGIN ERROR]', error.message);
    readyResolver(false);
  });
}

// Discord login starts only when Import Center is used.

async function ensureDiscordReady(timeoutMs = 30000) {
  startDiscordLogin();

  if (client.isReady()) return true;
  if (loginError) throw loginError;

  const ready = await Promise.race([
    readyPromise,
    new Promise((resolve) => setTimeout(() => resolve(false), timeoutMs)),
  ]);

  if (!ready || !client.isReady()) {
    throw new Error(
      'The Web Panel could not connect to Discord. Check DISCORD_TOKEN, bot intents, and guild access.'
    );
  }

  return true;
}

function avatarUrl(user) {
  if (!user || typeof user.displayAvatarURL !== 'function') return null;
  return user.displayAvatarURL({ extension: 'png', size: 256 });
}

function stripCodeBlock(value) {
  return String(value || '')
    .replace(/^```[a-z]*\s*/i, '')
    .replace(/```$/i, '')
    .trim();
}

function compactText(value, maximumLength = 180) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > maximumLength
    ? `${text.slice(0, maximumLength - 1)}…`
    : text;
}

function encodeMessagePayload(payload) {
  return `${MESSAGE_PAYLOAD_PREFIX}${JSON.stringify(payload)}`;
}

function serializeDiscordEmbed(embed) {
  if (!embed) return null;

  return {
    title: embed.title || null,
    description: embed.description || null,
    url: embed.url || null,
    color: Number.isInteger(embed.color) ? embed.color : null,
    timestamp: embed.timestamp || null,
    author: embed.author
      ? {
          name: embed.author.name || null,
          iconUrl: embed.author.iconURL || null,
          url: embed.author.url || null,
        }
      : null,
    footer: embed.footer
      ? {
          text: embed.footer.text || null,
          iconUrl: embed.footer.iconURL || null,
        }
      : null,
    thumbnailUrl: embed.thumbnail?.url || null,
    imageUrl: embed.image?.url || null,
    fields: Array.from(embed.fields || []).map((field) => ({
      name: field.name || 'Field',
      value: field.value || '',
      inline: Boolean(field.inline),
    })),
  };
}

function buildStructuredMessagePayload(message, messagesById) {
  const referencedId = message.reference?.messageId || null;
  const referencedMessage = referencedId
    ? messagesById.get(referencedId) || null
    : null;

  const firstReferencedEmbed = referencedMessage?.embeds?.[0];
  const reply = referencedId
    ? {
        messageId: referencedId,
        userId: referencedMessage?.author?.id || null,
        username:
          referencedMessage?.member?.displayName ||
          referencedMessage?.author?.globalName ||
          referencedMessage?.author?.username ||
          'Unknown message',
        content:
          compactText(referencedMessage?.content) ||
          compactText(firstReferencedEmbed?.description || firstReferencedEmbed?.title) ||
          (referencedMessage?.attachments?.size ? 'Attachment' : 'Message unavailable'),
        isBot: Boolean(referencedMessage?.author?.bot),
      }
    : null;

  return {
    version: 2,
    text: String(message.content || ''),
    displayName:
      message.member?.displayName ||
      message.author?.globalName ||
      message.author?.username ||
      'Unknown User',
    reply,
    embeds: Array.from(message.embeds || [])
      .map(serializeDiscordEmbed)
      .filter(Boolean),
    stickers: Array.from(message.stickers?.values?.() || []).map((sticker) => ({
      id: sticker.id,
      name: sticker.name || 'Sticker',
      url: sticker.url || null,
    })),
    editedAt:
      message.editedAt instanceof Date
        ? message.editedAt.toISOString()
        : null,
    deleted: false,
    deletedAt: null,
  };
}

function normalizeCategory(value) {
  const text = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (!text) return null;
  if (text.includes('ban') && text.includes('appeal')) return 'ban_appeal';
  if (text.includes('partner')) return 'partnership';
  if (text.includes('pov') || text.includes('pc_check') || text.includes('pc')) return 'pov_check';
  if (text.includes('boost')) return 'boost_claim';
  if (text.includes('report') || text.includes('clarification')) return 'report';
  return null;
}

function getCategoryFromChannel(channel, messages) {
  for (const message of messages) {
    for (const embed of message.embeds || []) {
      const footerText = embed.footer?.text || '';
      const footerMatch = footerText.match(/ticket\s*category\s*:\s*(.+)/i);
      if (footerMatch) {
        const category = normalizeCategory(footerMatch[1]);
        if (category) return category;
      }

      const category = normalizeCategory(`${embed.title || ''} ${embed.description || ''}`);
      if (category) return category;
    }
  }

  const configuredEntry = Object.entries(config.ticketCategories || {}).find(
    ([, categoryId]) => categoryId === channel.parentId
  );
  if (configuredEntry) return configuredEntry[0];

  return normalizeCategory(`${channel.name} ${channel.parent?.name || ''}`) || 'report';
}

function getTicketNumber(channel, messages) {
  for (const message of messages) {
    for (const embed of message.embeds || []) {
      const match = String(embed.title || '').match(/ticket\s*[-#:]?\s*(\d{3,})/i);
      if (match) return match[1];
    }
  }

  const nameMatch = String(channel.name || '').match(/(\d{3,})$/);
  return nameMatch ? nameMatch[1] : channel.id.slice(-6);
}

function extractMentionId(value) {
  const match = String(value || '').match(/<@!?(\d+)>/);
  return match ? match[1] : null;
}

function detectOwnerId(channel, messages) {
  const chronological = [...messages].sort(
    (a, b) => a.createdTimestamp - b.createdTimestamp
  );

  for (const message of chronological.slice(0, 30)) {
    if (!message.author?.bot) continue;

    const content = String(message.content || '');
    if (/hello|welcome|ticket owner|successfully initialized/i.test(content)) {
      const mentionedId = extractMentionId(content);
      if (mentionedId && mentionedId !== client.user?.id) return mentionedId;
    }
  }

  const earliestHuman = chronological.find(
    (message) => message.author && !message.author.bot
  );
  if (earliestHuman) return earliestHuman.author.id;

  const possibleOwner = channel.permissionOverwrites.cache.find(
    (overwrite) =>
      overwrite.type === OverwriteType.Member &&
      overwrite.id !== client.user?.id &&
      overwrite.allow.has(PermissionFlagsBits.ViewChannel)
  );

  return possibleOwner?.id || null;
}

function detectHandling(messages, ownerId) {
  let claimedBy = null;
  let claimedAt = null;
  let assignedTo = null;
  let assignedAt = null;

  const chronological = [...messages].sort(
    (a, b) => a.createdTimestamp - b.createdTimestamp
  );

  for (const message of chronological) {
    const content = String(message.content || '');

    const claimMatch = content.match(/ticket\s+claimed\s+by\s+<@!?(\d+)>/i);
    if (claimMatch) {
      claimedBy = claimMatch[1];
      assignedTo = assignedTo || claimedBy;
      claimedAt = message.createdAt;
      assignedAt = assignedAt || message.createdAt;
    }

    const assignMatch = content.match(/<@!?(\d+)>[^\n]*assigned\s+to\s+handle\s+this\s+ticket/i);
    if (assignMatch) {
      assignedTo = assignMatch[1];
      assignedAt = message.createdAt;
    }
  }

  return {
    claimedBy: claimedBy === ownerId ? null : claimedBy,
    claimedAt,
    assignedTo: assignedTo === ownerId ? null : assignedTo,
    assignedAt,
  };
}

function getDetailsFromMessages(messages, category) {
  const firstEmbedMessage = messages.find((message) => message.embeds?.length);
  const embed = firstEmbedMessage?.embeds?.[0];

  if (!embed) {
    return JSON.stringify({
      imported: true,
      category,
      note: 'No opening ticket embed was found during Discord recovery.',
    });
  }

  const fields = {};
  for (const field of embed.fields || []) {
    const key = String(field.name || 'field')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    fields[key || 'field'] = stripCodeBlock(field.value);
  }

  return JSON.stringify({
    imported: true,
    category,
    embedTitle: embed.title || null,
    fields,
  });
}

async function fetchAllMessages(channel, maximum, report, stagePrefix) {
  const messages = [];
  let before = null;

  while (messages.length < maximum) {
    const options = { limit: Math.min(100, maximum - messages.length) };
    if (before) options.before = before;

    const batch = await channel.messages.fetch(options);
    if (!batch.size) break;

    messages.push(...batch.values());
    before = batch.last().id;

    if (report) {
      report({
        stage: stagePrefix,
        message: `Fetched ${messages.length} messages from #${channel.name}.`,
      });
    }

    if (batch.size < 100) break;
  }

  return messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
}

async function upsertUser(dbClient, user, fallbackId = null) {
  const id = user?.id || fallbackId;
  if (!id) return;

  await dbClient.query(
    `
    INSERT INTO users (id, username, avatar, is_bot, updated_at)
    VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
    ON CONFLICT (id)
    DO UPDATE SET
      username = EXCLUDED.username,
      avatar = COALESCE(EXCLUDED.avatar, users.avatar),
      is_bot = EXCLUDED.is_bot,
      updated_at = CURRENT_TIMESTAMP
    `,
    [
      id,
      user?.username || user?.globalName || `Discord User ${id}`,
      avatarUrl(user),
      Boolean(user?.bot),
    ]
  );
}

async function upsertStaff(dbClient, guild, userId) {
  if (!userId) return;

  const user = await client.users.fetch(userId).catch(() => null);
  const member = await guild.members.fetch(userId).catch(() => null);
  const role = member?.roles?.cache
    ?.filter((item) => item.id !== guild.id)
    ?.sort((a, b) => b.position - a.position)
    ?.first()?.name || 'Ticket Handler';

  await upsertUser(dbClient, user, userId);
  await dbClient.query(
    `
    INSERT INTO staff (id, username, role, avatar, updated_at)
    VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
    ON CONFLICT (id)
    DO UPDATE SET
      username = EXCLUDED.username,
      role = EXCLUDED.role,
      avatar = COALESCE(EXCLUDED.avatar, staff.avatar),
      updated_at = CURRENT_TIMESTAMP
    `,
    [
      userId,
      user?.username || member?.displayName || `Staff ${userId}`,
      role,
      avatarUrl(user),
    ]
  );
}

async function saveOpenChannel(channel, guild, messages) {
  const dbClient = await pool.connect();

  try {
    await dbClient.query('BEGIN');

    const category = getCategoryFromChannel(channel, messages);
    const ticketNumber = getTicketNumber(channel, messages);
    const ownerId = detectOwnerId(channel, messages);
    const handling = detectHandling(messages, ownerId);
    const details = getDetailsFromMessages(messages, category);
    const ownerUser = ownerId
      ? await client.users.fetch(ownerId).catch(() => null)
      : null;

    if (ownerId) await upsertUser(dbClient, ownerUser, ownerId);
    if (handling.claimedBy) await upsertStaff(dbClient, guild, handling.claimedBy);
    if (handling.assignedTo) await upsertStaff(dbClient, guild, handling.assignedTo);

    const existingResult = await dbClient.query(
      `SELECT id, status FROM tickets WHERE channel_id = $1 OR id = $1 LIMIT 1`,
      [channel.id]
    );
    const ticketId = existingResult.rows[0]?.id || channel.id;
    const preserveClosed = existingResult.rows[0]?.status === 'closed';
    const lastMessage = messages[messages.length - 1] || null;

    await dbClient.query(
      `
      INSERT INTO tickets (
        id, ticket_id, ticket_number, guild_id, channel_id, channel_name,
        user_id, category, priority, status, details,
        claimed_by, claimed_at, assigned_to, assigned_at,
        created_at, last_activity_at, import_source, updated_at
      )
      VALUES (
        $1, $1, $2, $3, $4, $5,
        $6, $7, 'normal', $8, $9,
        $10, $11::timestamptz, $12, $13::timestamptz,
        $14::timestamptz, $15::timestamptz, 'discord_open_import', CURRENT_TIMESTAMP
      )
      ON CONFLICT (id)
      DO UPDATE SET
        ticket_number = EXCLUDED.ticket_number,
        guild_id = EXCLUDED.guild_id,
        channel_id = EXCLUDED.channel_id,
        channel_name = EXCLUDED.channel_name,
        user_id = COALESCE(EXCLUDED.user_id, tickets.user_id),
        category = EXCLUDED.category,
        status = CASE WHEN tickets.status = 'closed' THEN 'closed' ELSE EXCLUDED.status END,
        details = EXCLUDED.details,
        claimed_by = COALESCE(EXCLUDED.claimed_by, tickets.claimed_by),
        claimed_at = COALESCE(EXCLUDED.claimed_at, tickets.claimed_at),
        assigned_to = COALESCE(EXCLUDED.assigned_to, tickets.assigned_to),
        assigned_at = COALESCE(EXCLUDED.assigned_at, tickets.assigned_at),
        last_activity_at = EXCLUDED.last_activity_at,
        import_source = CASE WHEN tickets.import_source = 'live' THEN 'live' ELSE EXCLUDED.import_source END,
        updated_at = CURRENT_TIMESTAMP
      `,
      [
        ticketId,
        ticketNumber,
        guild.id,
        channel.id,
        channel.name,
        ownerId,
        category,
        preserveClosed ? 'closed' : 'open',
        details,
        handling.claimedBy,
        handling.claimedAt ? handling.claimedAt.toISOString() : null,
        handling.assignedTo,
        handling.assignedAt ? handling.assignedAt.toISOString() : null,
        channel.createdAt.toISOString(),
        (lastMessage?.createdAt || channel.createdAt).toISOString(),
      ]
    );

    if (!preserveClosed) {
      await dbClient.query(`DELETE FROM ticket_messages WHERE ticket_id = $1`, [ticketId]);

      const messagesById = new Map(messages.map((message) => [message.id, message]));

      for (const message of messages) {
        if (!message.author?.id) continue;

        await upsertUser(dbClient, message.author, message.author.id);
        const payload = buildStructuredMessagePayload(message, messagesById);

        await dbClient.query(
          `
          INSERT INTO ticket_messages (
            id, ticket_id, user_id, username, avatar, content,
            is_embed, is_bot, created_at, updated_at
          )
          VALUES (
            $1, $2, $3, $4, $5, $6,
            $7, $8, $9::timestamptz, CURRENT_TIMESTAMP
          )
          ON CONFLICT (id)
          DO UPDATE SET
            ticket_id = EXCLUDED.ticket_id,
            user_id = EXCLUDED.user_id,
            username = EXCLUDED.username,
            avatar = EXCLUDED.avatar,
            content = EXCLUDED.content,
            is_embed = EXCLUDED.is_embed,
            is_bot = EXCLUDED.is_bot,
            updated_at = CURRENT_TIMESTAMP
          `,
          [
            message.id,
            ticketId,
            message.author.id,
            payload.displayName,
            avatarUrl(message.author),
            encodeMessagePayload(payload),
            Boolean(message.embeds?.length),
            Boolean(message.author.bot),
            message.createdAt.toISOString(),
          ]
        );

        for (const attachment of message.attachments?.values?.() || []) {
          await dbClient.query(
            `
            INSERT INTO attachments (
              id, message_id, ticket_id, filename, url,
              content_type, size_bytes, created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz)
            ON CONFLICT (id)
            DO UPDATE SET
              message_id = EXCLUDED.message_id,
              ticket_id = EXCLUDED.ticket_id,
              filename = EXCLUDED.filename,
              url = EXCLUDED.url,
              content_type = EXCLUDED.content_type,
              size_bytes = EXCLUDED.size_bytes
            `,
            [
              attachment.id,
              message.id,
              ticketId,
              attachment.name || 'attachment',
              attachment.url,
              attachment.contentType || null,
              attachment.size || null,
              message.createdAt.toISOString(),
            ]
          );
        }
      }
    }

    await dbClient.query(
      `
      INSERT INTO ticket_logs (ticket_id, action, actor_id, description, metadata)
      SELECT $1, 'IMPORT_OPEN', NULL, $2, $3::jsonb
      WHERE NOT EXISTS (
        SELECT 1 FROM ticket_logs WHERE ticket_id = $1 AND action = 'IMPORT_OPEN'
      )
      `,
      [
        ticketId,
        `Recovered open Discord channel #${channel.name}.`,
        JSON.stringify({ channelId: channel.id, messageCount: messages.length }),
      ]
    );

    await dbClient.query('COMMIT');

    return {
      ticketId,
      channelName: channel.name,
      messageCount: messages.length,
      attachmentCount: messages.reduce(
        (total, message) => total + (message.attachments?.size || 0),
        0
      ),
    };
  } catch (error) {
    await dbClient.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    dbClient.release();
  }
}

function isPrivateTicketChannel(channel, guild) {
  if (!channel || channel.type !== ChannelType.GuildText) return false;
  if (transcriptChannelIds.has(channel.id)) return false;

  const configuredCategory = new Set(config.openTicketCategoryIds || []).has(channel.parentId);
  const ticketLikeName = /(^|-)ticket(-|$)|appeal|partnership|pov|pc-check|boost/i.test(
    channel.name || ''
  );
  const everyoneOverwrite = channel.permissionOverwrites.cache.get(guild.id);
  const privateChannel = Boolean(
    everyoneOverwrite?.deny?.has(PermissionFlagsBits.ViewChannel)
  );

  return configuredCategory || (ticketLikeName && privateChannel);
}

async function refreshStaffCounters() {
  await pool.query(`
    UPDATE staff s
    SET
      tickets_claimed = (
        SELECT COUNT(*)::INTEGER FROM tickets t WHERE t.claimed_by = s.id
      ),
      tickets_assigned = (
        SELECT COUNT(*)::INTEGER FROM tickets t WHERE t.assigned_to = s.id
      ),
      tickets_closed = (
        SELECT COUNT(*)::INTEGER FROM tickets t WHERE t.closed_by = s.id
      ),
      tickets_handled = (
        SELECT COUNT(*)::INTEGER
        FROM tickets t
        WHERE t.assigned_to = s.id OR t.claimed_by = s.id OR t.closed_by = s.id
      ),
      updated_at = CURRENT_TIMESTAMP
  `);
}

async function importOpenTickets(report = () => {}) {
  await ensureDiscordReady();

  const guildId = process.env.GUILD_ID || config.guildId;
  const guild = await client.guilds.fetch(guildId);
  await guild.channels.fetch();

  const candidates = guild.channels.cache
    .filter((channel) => isPrivateTicketChannel(channel, guild))
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
    .map((channel) => channel);

  const result = {
    importedTickets: 0,
    importedMessages: 0,
    importedAttachments: 0,
    skipped: 0,
    errors: [],
  };

  report({
    stage: 'Scanning open tickets',
    total: candidates.length,
    processed: 0,
    progress: candidates.length ? 5 : 100,
    message: `Found ${candidates.length} private ticket channels.`,
  });

  for (let index = 0; index < candidates.length; index += 1) {
    const channel = candidates[index];

    try {
      report({
        stage: 'Importing open tickets',
        processed: index,
        total: candidates.length,
        progress: 5 + ((index / Math.max(candidates.length, 1)) * 90),
        message: `Reading #${channel.name}.`,
      });

      const messages = await fetchAllMessages(
        channel,
        Number(config.maxOpenMessagesPerChannel || 5000),
        report,
        'Reading Discord messages'
      );
      const saved = await saveOpenChannel(channel, guild, messages);

      result.importedTickets += 1;
      result.importedMessages += saved.messageCount;
      result.importedAttachments += saved.attachmentCount;

      report({
        detail: `Recovered #${channel.name}: ${saved.messageCount} messages.`,
      });
    } catch (error) {
      result.errors.push({ channel: channel.name, error: error.message });
      report({ detail: `Failed #${channel.name}: ${error.message}` });
    }
  }

  await refreshStaffCounters();

  result.skipped = result.errors.length;
  result.message =
    `Recovered ${result.importedTickets} open tickets, ` +
    `${result.importedMessages} messages, and ` +
    `${result.importedAttachments} attachments.`;

  report({
    stage: 'Open ticket recovery complete',
    processed: candidates.length,
    total: candidates.length,
    progress: 100,
    message: result.message,
  });

  return result;
}

function getEmbedFields(embed) {
  const fields = new Map();
  for (const field of embed?.fields || []) {
    fields.set(String(field.name || '').trim().toLowerCase(), String(field.value || '').trim());
  }
  return fields;
}

function findField(fields, names) {
  for (const name of names) {
    for (const [fieldName, value] of fields.entries()) {
      if (fieldName.includes(name)) return value;
    }
  }
  return null;
}

function categoryFromTranscriptChannel(channelId, panelName) {
  const configured = Object.entries(config.transcriptChannels || {}).find(
    ([, id]) => id === channelId
  );
  return configured?.[0] || normalizeCategory(panelName) || 'report';
}

async function downloadTranscriptHtml(url) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(`Discord transcript download returned HTTP ${response.status}.`);
  }

  return response.text();
}

async function saveClosedTranscript({
  guild,
  logChannel,
  attachmentMessage,
  summaryMessage,
  attachment,
}) {
  const embed = summaryMessage?.embeds?.[0] || attachmentMessage.embeds?.[0] || null;
  const fields = getEmbedFields(embed);

  const ownerValue = findField(fields, ['ticket owner', 'owner']);
  const closedByValue = findField(fields, ['closed by']);
  const ticketNameValue = findField(fields, ['ticket name', 'channel']);
  const panelNameValue = findField(fields, ['panel name', 'category']);

  const ownerId = extractMentionId(ownerValue);
  const closedById = extractMentionId(closedByValue);
  const filename = attachment.name || `transcript-${attachmentMessage.id}.html`;
  const filenameTicketName = filename
    .replace(/^transcript-/i, '')
    .replace(/\.html?$/i, '');
  const ticketName = stripCodeBlock(ticketNameValue) || filenameTicketName;
  const ticketNumber = String(ticketName).match(/(\d{3,})$/)?.[1] || attachmentMessage.id.slice(-6);
  const category = categoryFromTranscriptChannel(logChannel.id, panelNameValue);
  const html = await downloadTranscriptHtml(attachment.url);

  const dbClient = await pool.connect();

  try {
    await dbClient.query('BEGIN');

    const ownerUser = ownerId
      ? await client.users.fetch(ownerId).catch(() => null)
      : null;
    if (ownerId) await upsertUser(dbClient, ownerUser, ownerId);
    if (closedById) await upsertStaff(dbClient, guild, closedById);

    const summaryId = summaryMessage?.id || attachmentMessage.id;
    const existing = await dbClient.query(
      `
      SELECT id
      FROM tickets
      WHERE transcript_message_id = $1
         OR (
           status = 'closed'
           AND channel_name = $2
           AND ($3::text IS NULL OR user_id = $3)
         )
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [summaryId, ticketName, ownerId]
    );

    const ticketId = existing.rows[0]?.id || `discord-transcript-${attachmentMessage.id}`;
    const closedAt = (summaryMessage?.createdAt || attachmentMessage.createdAt).toISOString();
    const discordMessageUrl = summaryMessage?.url || attachmentMessage.url;

    await dbClient.query(
      `
      INSERT INTO tickets (
        id, ticket_id, ticket_number, guild_id, channel_id, channel_name,
        user_id, category, priority, status, details,
        created_at, last_activity_at, closed_at, closed_by, close_reason,
        transcript_message_id, transcript_channel_id, transcript_url,
        import_source, updated_at
      )
      VALUES (
        $1, $1, $2, $3, NULL, $4,
        $5, $6, 'normal', 'closed', $7,
        $8::timestamptz, $8::timestamptz, $8::timestamptz, $9, $10,
        $11, $12, $13,
        'discord_transcript_import', CURRENT_TIMESTAMP
      )
      ON CONFLICT (id)
      DO UPDATE SET
        ticket_number = EXCLUDED.ticket_number,
        guild_id = EXCLUDED.guild_id,
        channel_name = EXCLUDED.channel_name,
        user_id = COALESCE(EXCLUDED.user_id, tickets.user_id),
        category = EXCLUDED.category,
        status = 'closed',
        closed_at = EXCLUDED.closed_at,
        closed_by = COALESCE(EXCLUDED.closed_by, tickets.closed_by),
        close_reason = EXCLUDED.close_reason,
        transcript_message_id = EXCLUDED.transcript_message_id,
        transcript_channel_id = EXCLUDED.transcript_channel_id,
        transcript_url = EXCLUDED.transcript_url,
        import_source = CASE WHEN tickets.import_source = 'live' THEN 'live' ELSE EXCLUDED.import_source END,
        updated_at = CURRENT_TIMESTAMP
      `,
      [
        ticketId,
        ticketNumber,
        guild.id,
        ticketName,
        ownerId,
        category,
        JSON.stringify({ imported: true, source: 'Discord HTML transcript' }),
        closedAt,
        closedById,
        'Imported from Discord transcript logs',
        summaryId,
        logChannel.id,
        attachment.url,
      ]
    );

    await dbClient.query(
      `
      INSERT INTO ticket_transcripts (
        id, ticket_id, html_content, discord_url,
        log_channel_id, log_message_id, generated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz)
      ON CONFLICT (id)
      DO UPDATE SET
        ticket_id = EXCLUDED.ticket_id,
        html_content = EXCLUDED.html_content,
        discord_url = EXCLUDED.discord_url,
        log_channel_id = EXCLUDED.log_channel_id,
        log_message_id = EXCLUDED.log_message_id,
        generated_at = EXCLUDED.generated_at
      `,
      [
        `transcript-${attachmentMessage.id}`,
        ticketId,
        html,
        discordMessageUrl,
        logChannel.id,
        summaryId,
        closedAt,
      ]
    );

    await dbClient.query(
      `
      INSERT INTO ticket_logs (ticket_id, action, actor_id, description, metadata)
      SELECT $1, 'IMPORT_CLOSED', $2, $3, $4::jsonb
      WHERE NOT EXISTS (
        SELECT 1 FROM ticket_logs WHERE ticket_id = $1 AND action = 'IMPORT_CLOSED'
      )
      `,
      [
        ticketId,
        closedById,
        `Recovered closed ticket transcript ${filename}.`,
        JSON.stringify({
          logChannelId: logChannel.id,
          attachmentMessageId: attachmentMessage.id,
          summaryMessageId: summaryId,
        }),
      ]
    );

    await dbClient.query('COMMIT');

    return {
      ticketId,
      ticketName,
      htmlSize: Buffer.byteLength(html, 'utf8'),
    };
  } catch (error) {
    await dbClient.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    dbClient.release();
  }
}

function findTranscriptSummary(chronologicalMessages, attachmentIndex) {
  const attachmentMessage = chronologicalMessages[attachmentIndex];

  if (attachmentMessage.embeds?.some((embed) => embed.fields?.length)) {
    return attachmentMessage;
  }

  for (
    let index = attachmentIndex + 1;
    index < Math.min(chronologicalMessages.length, attachmentIndex + 8);
    index += 1
  ) {
    const candidate = chronologicalMessages[index];
    const secondsApart =
      (candidate.createdTimestamp - attachmentMessage.createdTimestamp) / 1000;

    if (secondsApart > 300) break;

    const fields = getEmbedFields(candidate.embeds?.[0]);
    if (
      findField(fields, ['ticket owner', 'ticket name', 'panel name'])
    ) {
      return candidate;
    }
  }

  return attachmentMessage;
}

async function importClosedTicketsAndTranscripts(report = () => {}) {
  await ensureDiscordReady();

  const guildId = process.env.GUILD_ID || config.guildId;
  const guild = await client.guilds.fetch(guildId);
  const channelIds = [...transcriptChannelIds];

  const result = {
    importedTickets: 0,
    importedTranscripts: 0,
    downloadedBytes: 0,
    skipped: 0,
    errors: [],
  };

  report({
    stage: 'Scanning transcript channels',
    total: channelIds.length,
    processed: 0,
    progress: 5,
    message: `Checking ${channelIds.length} configured transcript channels.`,
  });

  for (let channelIndex = 0; channelIndex < channelIds.length; channelIndex += 1) {
    const channelId = channelIds[channelIndex];
    const logChannel = await guild.channels.fetch(channelId).catch(() => null);

    if (!logChannel || logChannel.type !== ChannelType.GuildText) {
      result.skipped += 1;
      report({ detail: `Skipped unavailable transcript channel ${channelId}.` });
      continue;
    }

    try {
      const messages = await fetchAllMessages(
        logChannel,
        Number(config.maxTranscriptMessagesPerChannel || 10000),
        report,
        'Reading transcript logs'
      );
      const chronological = [...messages].sort(
        (a, b) => a.createdTimestamp - b.createdTimestamp
      );

      const transcriptEntries = [];
      chronological.forEach((message, index) => {
        for (const attachment of message.attachments?.values?.() || []) {
          if (/\.html?$/i.test(attachment.name || '')) {
            transcriptEntries.push({
              attachmentMessage: message,
              summaryMessage: findTranscriptSummary(chronological, index),
              attachment,
            });
          }
        }
      });

      for (let entryIndex = 0; entryIndex < transcriptEntries.length; entryIndex += 1) {
        const entry = transcriptEntries[entryIndex];

        try {
          const saved = await saveClosedTranscript({
            guild,
            logChannel,
            ...entry,
          });

          result.importedTickets += 1;
          result.importedTranscripts += 1;
          result.downloadedBytes += saved.htmlSize;
          report({ detail: `Recovered ${saved.ticketName} from #${logChannel.name}.` });
        } catch (error) {
          result.errors.push({
            channel: logChannel.name,
            attachment: entry.attachment.name,
            error: error.message,
          });
          report({
            detail: `Failed ${entry.attachment.name}: ${error.message}`,
          });
        }
      }

      report({
        stage: 'Importing closed transcripts',
        processed: channelIndex + 1,
        total: channelIds.length,
        progress: 5 + (((channelIndex + 1) / Math.max(channelIds.length, 1)) * 90),
        message: `Finished #${logChannel.name}: ${transcriptEntries.length} HTML files found.`,
      });
    } catch (error) {
      result.errors.push({ channel: logChannel.name, error: error.message });
      report({ detail: `Failed #${logChannel.name}: ${error.message}` });
    }
  }

  await refreshStaffCounters();

  result.message =
    `Recovered ${result.importedTranscripts} closed HTML transcripts ` +
    `(${Math.round(result.downloadedBytes / 1024)} KB).`;

  report({
    stage: 'Closed transcript recovery complete',
    processed: channelIds.length,
    total: channelIds.length,
    progress: 100,
    message: result.message,
  });

  return result;
}

async function getDiscordImportStatus() {
  const databaseCounts = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE status = 'open')::INTEGER AS open_tickets,
      COUNT(*) FILTER (WHERE status = 'closed')::INTEGER AS closed_tickets,
      (SELECT COUNT(*)::INTEGER FROM ticket_messages) AS messages,
      (SELECT COUNT(*)::INTEGER FROM ticket_transcripts) AS transcripts
    FROM tickets
  `);

  const base = {
    tokenConfigured: Boolean(process.env.DISCORD_TOKEN || process.env.TOKEN),
    ready: client.isReady(),
    botTag: client.user?.tag || null,
    guildId: process.env.GUILD_ID || config.guildId,
    openCategoryCount: (config.openTicketCategoryIds || []).length,
    transcriptChannelCount: transcriptChannelIds.size,
    database: databaseCounts.rows[0],
    error: loginError?.message || null,
  };

  if (!client.isReady()) return base;

  const guild = await client.guilds
    .fetch(base.guildId)
    .catch(() => null);

  return {
    ...base,
    guildName: guild?.name || null,
    guildAvailable: Boolean(guild),
  };
}

module.exports = {
  client,
  ensureDiscordReady,
  importOpenTickets,
  importClosedTicketsAndTranscripts,
  refreshStaffCounters,
  getDiscordImportStatus,
};
