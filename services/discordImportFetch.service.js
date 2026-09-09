'use strict';

const RETRYABLE_HTTP_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const RETRYABLE_NETWORK_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'EHOSTUNREACH',
  'ENETDOWN',
  'ENETUNREACH',
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_SOCKET',
]);

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isRetryableError(error) {
  const status = Number(error?.status || error?.statusCode);
  if (RETRYABLE_HTTP_STATUS.has(status)) return true;
  const code = String(error?.code || error?.cause?.code || '').toUpperCase();
  if (RETRYABLE_NETWORK_CODES.has(code)) return true;
  const message = String(error?.message || '').toLowerCase();
  return message.includes('timeout') || message.includes('timed out') || message.includes('socket');
}

async function withRetry(operation, {
  attempts = 3,
  baseDelayMs = 300,
} = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (attempt >= attempts || !isRetryableError(error)) throw error;
      await sleep(Math.min(5000, baseDelayMs * (2 ** (attempt - 1))));
    }
  }
  throw lastError;
}

function sortMessages(messages) {
  return messages.sort((left, right) => {
    const leftTime = Number(left?.createdTimestamp) || Date.parse(left?.timestamp || '') || 0;
    const rightTime = Number(right?.createdTimestamp) || Date.parse(right?.timestamp || '') || 0;
    return leftTime - rightTime;
  });
}

async function fetchDiscordJsMessages(channel, maximum, report = () => {}) {
  const messages = [];
  let before = null;

  while (messages.length < maximum) {
    const pageLimit = Math.min(100, maximum - messages.length);
    const options = { limit: pageLimit };
    if (before) options.before = before;

    const batch = await withRetry(() => channel.messages.fetch(options));
    if (!batch?.size) break;

    messages.push(...batch.values());
    const nextBefore = batch.last()?.id || null;
    if (!nextBefore || nextBefore === before) {
      const error = new Error(`Discord message pagination stalled in #${channel.name}.`);
      error.code = 'DISCORD_IMPORT_PAGINATION_STALLED';
      throw error;
    }
    before = nextBefore;

    report({
      stage: `Reading #${channel.name}`,
      progress: Math.min(45, 5 + Math.floor(messages.length / 100)),
      message: `${messages.length.toLocaleString()} log messages checked.`,
    });

    if (batch.size < pageLimit) break;
  }

  return sortMessages(messages);
}

async function fetchRawPage(url, token, attempts = 3) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let response;
    try {
      response = await fetch(url, {
        headers: {
          Authorization: `Bot ${token}`,
          'User-Agent': '5th-Avenue-Web-Panel/1.0',
        },
        redirect: 'error',
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      lastError = error;
      if (attempt >= attempts || !isRetryableError(error)) throw error;
      await sleep(Math.min(5000, 300 * (2 ** (attempt - 1))));
      continue;
    }

    if (response.ok) return response.json();

    if (attempt < attempts && RETRYABLE_HTTP_STATUS.has(response.status)) {
      const retryAfter = Number(response.headers.get('retry-after'));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0
        ? (retryAfter > 1000 ? retryAfter : retryAfter * 1000)
        : Math.min(5000, 300 * (2 ** (attempt - 1)));
      await response.body?.cancel?.().catch?.(() => {});
      await sleep(delay);
      continue;
    }

    const body = await response.text().catch(() => '');
    const error = new Error(
      `Discord raw message fetch returned HTTP ${response.status}${body ? `: ${body.slice(0, 180)}` : '.'}`
    );
    error.code = 'DISCORD_RAW_FETCH_FAILED';
    error.status = response.status;
    throw error;
  }

  throw lastError || new Error('Discord raw message fetch failed.');
}

async function fetchDiscordRestMessages(channel, maximum, report = () => {}) {
  const token = String(process.env.DISCORD_TOKEN || process.env.TOKEN || '').trim();
  if (!token) {
    const error = new Error('DISCORD_TOKEN is unavailable for raw transcript recovery.');
    error.code = 'DISCORD_TOKEN_MISSING';
    throw error;
  }

  const messages = [];
  let before = null;

  while (messages.length < maximum) {
    const pageLimit = Math.min(100, maximum - messages.length);
    const url = new URL(`https://discord.com/api/v10/channels/${channel.id}/messages`);
    url.searchParams.set('limit', String(pageLimit));
    if (before) url.searchParams.set('before', before);

    const batch = await fetchRawPage(url, token);
    if (!Array.isArray(batch) || !batch.length) break;

    messages.push(...batch);
    const nextBefore = batch[batch.length - 1]?.id || null;
    if (!nextBefore || nextBefore === before) {
      const error = new Error(`Discord REST pagination stalled in #${channel.name}.`);
      error.code = 'DISCORD_RAW_PAGINATION_STALLED';
      throw error;
    }
    before = nextBefore;

    report({
      stage: `Reading #${channel.name}`,
      progress: Math.min(48, 5 + Math.floor(messages.length / 100)),
      message: `${messages.length.toLocaleString()} raw Discord messages checked.`,
    });

    if (batch.length < pageLimit) break;
  }

  return sortMessages(messages);
}

module.exports = {
  RETRYABLE_HTTP_STATUS,
  fetchDiscordJsMessages,
  fetchDiscordRestMessages,
  fetchRawPage,
  isRetryableError,
  sortMessages,
  withRetry,
};
