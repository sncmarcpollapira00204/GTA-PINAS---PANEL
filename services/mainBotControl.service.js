'use strict';

const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);
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

function getConfiguration() {
  const baseUrl = String(process.env.MAIN_BOT_CONTROL_URL || '').trim().replace(/\/+$/, '');
  const secret = String(process.env.MAIN_BOT_CONTROL_SECRET || '').trim();

  if (!baseUrl || !secret) {
    const error = new Error(
      'MAIN_BOT_CONTROL_URL and MAIN_BOT_CONTROL_SECRET must be configured in the Web Panel service.'
    );
    error.code = 'MAIN_BOT_CONTROL_NOT_CONFIGURED';
    throw error;
  }

  let parsed;
  try {
    parsed = new URL(baseUrl);
  } catch (_) {
    const error = new Error('MAIN_BOT_CONTROL_URL is not a valid HTTP or HTTPS URL.');
    error.code = 'MAIN_BOT_CONTROL_NOT_CONFIGURED';
    throw error;
  }

  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    const error = new Error(
      'MAIN_BOT_CONTROL_URL must use HTTP or HTTPS and must not contain embedded credentials.'
    );
    error.code = 'MAIN_BOT_CONTROL_NOT_CONFIGURED';
    throw error;
  }

  return { baseUrl, secret };
}

function isRetryableNetworkError(error) {
  const code = String(error?.code || error?.cause?.code || '').toUpperCase();
  if (RETRYABLE_NETWORK_CODES.has(code)) return true;
  const message = String(error?.message || '').toLowerCase();
  return message.includes('timeout') || message.includes('timed out') || message.includes('socket');
}

function responseRetryDelay(response, attempt) {
  const retryAfter = Number(response?.headers?.get?.('retry-after'));
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return retryAfter > 1000 ? Math.ceil(retryAfter) : Math.ceil(retryAfter * 1000);
  }
  return Math.min(5000, 300 * (2 ** Math.max(0, attempt - 1)));
}

async function requestRaw(path, {
  method = 'GET',
  userId,
  body,
  timeoutMs = 30000,
  retries = 0,
} = {}) {
  const { baseUrl, secret } = getConfiguration();
  const headers = {
    Accept: 'application/json',
    'X-Main-Bot-Secret': secret,
    'X-Panel-User-Id': String(userId || ''),
  };

  let requestBody;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json; charset=utf-8';
    requestBody = JSON.stringify(body);
  }

  const normalizedRetries = method === 'GET'
    ? Math.max(0, Math.min(3, Math.floor(Number(retries) || 0)))
    : 0;
  const totalAttempts = normalizedRetries + 1;
  let lastError;

  for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
    let response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: requestBody,
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      lastError = error;
      if (attempt < totalAttempts && isRetryableNetworkError(error)) {
        await sleep(Math.min(5000, 300 * (2 ** (attempt - 1))));
        continue;
      }

      const wrapped = new Error(
        error?.name === 'TimeoutError'
          ? 'The Main Bot did not respond before the request timed out.'
          : `Unable to connect to the Main Bot control service: ${error.message}`
      );
      wrapped.code = 'MAIN_BOT_CONTROL_UNAVAILABLE';
      throw wrapped;
    }

    if (
      attempt < totalAttempts &&
      RETRYABLE_STATUS_CODES.has(response.status)
    ) {
      const delay = responseRetryDelay(response, attempt);
      await response.body?.cancel?.().catch?.(() => {});
      await sleep(delay);
      continue;
    }

    return response;
  }

  const wrapped = new Error(
    `Unable to connect to the Main Bot control service: ${lastError?.message || 'request failed'}`
  );
  wrapped.code = 'MAIN_BOT_CONTROL_UNAVAILABLE';
  throw wrapped;
}

async function requestJson(path, options) {
  const response = await requestRaw(path, options);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(payload.error || `Main Bot request failed (${response.status}).`);
    error.code = payload.code || 'MAIN_BOT_CONTROL_ERROR';
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

function getStatus(userId) {
  return requestJson('/internal/status', { userId, timeoutMs: 60000, retries: 2 });
}

function startFullBackup(userId) {
  return requestJson('/internal/backups', {
    method: 'POST',
    userId,
    timeoutMs: 20000,
  });
}

function getBackupJob(userId, jobId) {
  return requestJson(`/internal/backups/${encodeURIComponent(jobId)}`, {
    userId,
    timeoutMs: 20000,
    retries: 2,
  });
}

function downloadBackup(userId, jobId) {
  return requestRaw(`/internal/backups/${encodeURIComponent(jobId)}/download`, {
    userId,
    timeoutMs: 10 * 60 * 1000,
    retries: 2,
  });
}

function getTranscriptMessages(userId, channelId, maximum = 10000) {
  const normalizedLimit = Math.min(10000, Math.max(1, Number(maximum) || 10000));
  return requestJson(
    `/internal/transcript-channels/${encodeURIComponent(channelId)}?limit=${encodeURIComponent(normalizedLimit)}`,
    { userId, timeoutMs: 90000, retries: 2 }
  );
}

function clearDatabases(userId, confirmation) {
  return requestJson('/internal/clear-databases', {
    method: 'POST',
    userId,
    body: { confirmation },
    timeoutMs: 10 * 60 * 1000,
  });
}

module.exports = {
  clearDatabases,
  downloadBackup,
  getBackupJob,
  getConfiguration,
  getStatus,
  getTranscriptMessages,
  isRetryableNetworkError,
  requestJson,
  requestRaw,
  responseRetryDelay,
  startFullBackup,
};
