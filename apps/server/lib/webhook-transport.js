'use strict';

/**
 * Shared outbound-webhook transport (extracted from
 * integration-webhook.service so CX webhooks reuse it without
 * duplicating crypto, SSRF guards, signing, or retry math).
 *
 * - Secrets are AES-256-GCM encrypted at rest (key from
 *   INTEGRATION_WEBHOOK_ENCRYPTION_KEY or the session secret).
 * - Destinations must be public HTTPS (http allowed off-production),
 *   carry no embedded credentials, and resolve only to public IPs.
 * - Deliveries are HMAC-SHA256 signed over the exact raw bytes.
 * - Retries use exponential backoff with jitter, bounded attempts.
 */

const crypto = require('crypto');
const dns = require('dns').promises;
const net = require('net');
const config = require('../config');

const MAX_ATTEMPTS = 6;
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000, 12 * 60 * 60_000];
const FETCH_TIMEOUT_MS = 10_000;

function encryptionKey() {
  const source = process.env.INTEGRATION_WEBHOOK_ENCRYPTION_KEY || config.session.secret;
  return crypto.createHash('sha256').update(String(source)).digest();
}

function encryptSecret(secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${ciphertext.toString('base64url')}`;
}

function decryptSecret(value) {
  const [version, ivRaw, tagRaw, ciphertextRaw] = String(value || '').split('.');
  if (version !== 'v1' || !ivRaw || !tagRaw || !ciphertextRaw) throw new Error('Invalid encrypted webhook secret');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivRaw, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextRaw, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

function newSigningSecret(prefix = 'dgv_whsec_') {
  return `${prefix}${crypto.randomBytes(32).toString('base64url')}`;
}

function signPayload(rawBody, secret) {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

function isPrivateIp(address) {
  if (!address) return true;
  if (net.isIP(address) === 4) {
    const parts = address.split('.').map(Number);
    return (
      parts[0] === 10 ||
      parts[0] === 127 ||
      (parts[0] === 169 && parts[1] === 254) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      parts[0] === 0
    );
  }
  if (net.isIP(address) === 6) {
    const normalized = address.toLowerCase();
    return normalized === '::1' || normalized === '::' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:');
  }
  return true;
}

async function assertPublicWebhookUrl(rawUrl) {
  let url;
  try {
    url = new URL(String(rawUrl || '').trim());
  } catch {
    const err = new Error('Webhook URL must be a valid absolute URL');
    err.statusCode = 400;
    throw err;
  }
  if (url.protocol !== 'https:' && !(config.env !== 'production' && url.protocol === 'http:')) {
    const err = new Error('Webhook URL must use HTTPS');
    err.statusCode = 400;
    throw err;
  }
  if (url.username || url.password) {
    const err = new Error('Webhook URL must not contain embedded credentials');
    err.statusCode = 400;
    throw err;
  }
  const hostname = url.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    const err = new Error('Webhook URL cannot target a local/private host');
    err.statusCode = 400;
    throw err;
  }
  const records = net.isIP(hostname)
    ? [{ address: hostname }]
    : await dns.lookup(hostname, { all: true, verbatim: true }).catch(() => []);
  if (!records.length || records.some((record) => isPrivateIp(record.address))) {
    const err = new Error('Webhook URL must resolve only to public IP addresses');
    err.statusCode = 400;
    throw err;
  }
  return url.toString();
}

function nextAttemptIso(attempts, now = Date.now()) {
  const delay = RETRY_DELAYS_MS[Math.min(Math.max(attempts - 1, 0), RETRY_DELAYS_MS.length - 1)];
  const jitter = Math.floor(Math.random() * Math.min(delay * 0.1, 30_000));
  return new Date(now + delay + jitter).toISOString();
}

/**
 * POST one signed JSON payload. Returns { ok, status, durationMs } or
 * throws on network failure. Never follows redirects (SSRF: the validated
 * URL is the only URL fetched).
 */
async function postSignedJson({ url, rawBody, headers = {}, userAgent = 'Dilivygo-Webhooks/1.0' }) {
  const started = Date.now();
  const response = await fetch(url, {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { 'Content-Type': 'application/json', 'User-Agent': userAgent, ...headers },
    body: rawBody,
  });
  return { ok: response.ok, status: response.status, durationMs: Date.now() - started };
}

module.exports = {
  MAX_ATTEMPTS,
  RETRY_DELAYS_MS,
  FETCH_TIMEOUT_MS,
  encryptSecret,
  decryptSecret,
  newSigningSecret,
  signPayload,
  isPrivateIp,
  assertPublicWebhookUrl,
  nextAttemptIso,
  postSignedJson,
};
