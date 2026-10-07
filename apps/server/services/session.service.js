'use strict';

const { opaqueId } = require('../lib/opaque-id');
const config = require('../config');
const { getRedis } = require('../lib/redis');
const MemorySessionStore = require('./memory-session-store');
const RedisSessionStore = require('./redis-session-store');
const logger = require('../lib/logger');

let _store = null;

function getStore() {
  if (_store) return _store;

  const redis = getRedis();
  if (redis) {
    logger.info('Session store: Redis');
    _store = new RedisSessionStore(redis);
  } else {
    logger.warn('Session store: in-memory (not suitable for production)');
    if (config.isProd) {
      logger.error(
        'REDIS_URL is not set — OTP and sessions are stored in process memory only. ' +
          'With more than one API instance (e.g. Railway replicas), OTP verify will randomly fail. ' +
          'Add Redis (Railway Redis plugin) and set REDIS_URL, or run a single instance.'
      );
    }
    _store = new MemorySessionStore();
  }
  return _store;
}

// ─── Admin/Staff Sessions ───────────────────────────────────────────────────

async function createAdminSession(userData) {
  const sessionId = opaqueId();
  const key = `session:admin:${sessionId}`;
  await getStore().set(key, { ...userData, type: 'admin' }, config.session.adminTTL);
  return sessionId;
}

async function getAdminSession(sessionId) {
  if (!sessionId) return null;
  return getStore().get(`session:admin:${sessionId}`);
}

async function deleteAdminSession(sessionId) {
  if (!sessionId) return;
  await getStore().delete(`session:admin:${sessionId}`);
}

// ─── Superadmin Sessions ─────────────────────────────────────────────────────

async function createSuperadminSession(data) {
  const sessionId = opaqueId();
  const key = `session:superadmin:${sessionId}`;
  await getStore().set(key, { ...data, type: 'superadmin' }, config.session.adminTTL);
  return sessionId;
}

async function getSuperadminSession(sessionId) {
  if (!sessionId) return null;
  return getStore().get(`session:superadmin:${sessionId}`);
}

async function deleteSuperadminSession(sessionId) {
  if (!sessionId) return;
  await getStore().delete(`session:superadmin:${sessionId}`);
}

// ─── Customer Sessions ───────────────────────────────────────────────────────

async function createCustomerSession(customerData) {
  const sessionId = opaqueId();
  const key = `session:customer:${sessionId}`;
  await getStore().set(key, { ...customerData, type: 'customer' }, config.session.customerTTL);
  return sessionId;
}

async function getCustomerSession(sessionId) {
  if (!sessionId) return null;
  return getStore().get(`session:customer:${sessionId}`);
}

async function deleteCustomerSession(sessionId) {
  if (!sessionId) return;
  await getStore().delete(`session:customer:${sessionId}`);
}

// ─── Dilivygo Talent Sessions ────────────────────────────────────────────────

async function createTalentSession(candidateData) {
  const sessionId = opaqueId();
  const key = `session:talent:${sessionId}`;
  await getStore().set(key, { ...candidateData, type: 'talent' }, config.session.customerTTL);
  return sessionId;
}

async function getTalentSession(sessionId) {
  if (!sessionId) return null;
  return getStore().get(`session:talent:${sessionId}`);
}

async function deleteTalentSession(sessionId) {
  if (!sessionId) return;
  await getStore().delete(`session:talent:${sessionId}`);
}

// ─── OTP Tokens ──────────────────────────────────────────────────────────────

function otpRecipientKey({ channel, recipient, projectRef }) {
  return `otp:${projectRef}:${channel}:${String(recipient).toLowerCase()}`;
}

function otpRateKey({ channel, recipient, projectRef }) {
  return `otp:rate:${projectRef}:${channel}:${String(recipient).toLowerCase()}`;
}

function recoveryRecipientKey({ email, projectRef }) {
  return `otp:recovery:${projectRef}:email:${String(email).toLowerCase()}`;
}

function recoveryRateKey({ email, projectRef }) {
  return `otp:recovery:rate:${projectRef}:email:${String(email).toLowerCase()}`;
}

async function setOTP({ channel, recipient, projectRef }, code) {
  await getStore().set(otpRecipientKey({ channel, recipient, projectRef }), { code, attempts: 0 }, config.otp.ttl);
}

async function getOTP({ channel, recipient, projectRef }) {
  return getStore().get(otpRecipientKey({ channel, recipient, projectRef }));
}

async function incrementOTPAttempts({ channel, recipient, projectRef }, entry) {
  const updated = { ...entry, attempts: entry.attempts + 1 };
  const ttl = config.otp.ttl; // reset window not required; just overwrite
  await getStore().set(otpRecipientKey({ channel, recipient, projectRef }), updated, ttl);
  return updated;
}

async function deleteOTP({ channel, recipient, projectRef }) {
  await getStore().delete(otpRecipientKey({ channel, recipient, projectRef }));
}

async function checkOTPRateLimit({ channel, recipient, projectRef }) {
  const key = otpRateKey({ channel, recipient, projectRef });
  const count = await getStore().get(key);
  if (count && count.count >= config.otp.rateLimitCount) return false;
  const current = count ? count.count : 0;
  await getStore().set(key, { count: current + 1 }, config.otp.rateLimitWindow);
  return true;
}

async function setCustomerRecoveryOTP({ email, projectRef }, code) {
  await getStore().set(recoveryRecipientKey({ email, projectRef }), { code, attempts: 0 }, config.otp.ttl);
}

async function getCustomerRecoveryOTP({ email, projectRef }) {
  return getStore().get(recoveryRecipientKey({ email, projectRef }));
}

async function incrementCustomerRecoveryOTPAttempts({ email, projectRef }, entry) {
  const updated = { ...entry, attempts: entry.attempts + 1 };
  await getStore().set(recoveryRecipientKey({ email, projectRef }), updated, config.otp.ttl);
  return updated;
}

async function deleteCustomerRecoveryOTP({ email, projectRef }) {
  await getStore().delete(recoveryRecipientKey({ email, projectRef }));
}

async function checkCustomerRecoveryRateLimit({ email, projectRef }) {
  const key = recoveryRateKey({ email, projectRef });
  const count = await getStore().get(key);
  if (count && count.count >= config.otp.rateLimitCount) return false;
  const current = count ? count.count : 0;
  await getStore().set(key, { count: current + 1 }, config.otp.rateLimitWindow);
  return true;
}

// ─── Password Reset Tokens ───────────────────────────────────────────────────

async function setResetToken(token, data) {
  await getStore().set(`reset:${token}`, data, 3600); // 1 hour
}

async function getResetToken(token) {
  return getStore().get(`reset:${token}`);
}

async function deleteResetToken(token) {
  await getStore().delete(`reset:${token}`);
}

// ─── Rider Location Cache ────────────────────────────────────────────────────

async function cacheRiderLocation(deliveryId, locationData) {
  await getStore().set(`location:${deliveryId}`, locationData, config.location.cacheTTL);
}

async function getRiderLocation(deliveryId) {
  return getStore().get(`location:${deliveryId}`);
}

async function flushLocationCache(deliveryId) {
  await getStore().delete(`location:${deliveryId}`);
}

// ─── Location Rate Limit (1 update per 3s per delivery) ─────────────────────

async function checkLocationRateLimit(deliveryId) {
  const key = `location:rate:${deliveryId}`;
  const exists = await getStore().get(key);
  if (exists) return false;
  await getStore().set(key, 1, config.location.updateIntervalSeconds);
  return true;
}

// ─── Rider Availability Location (for matching) ──────────────────────────────

async function cacheRiderAvailability(projectRef, riderId, locationData) {
  await getStore().set(
    `rider:availability:${projectRef}:${riderId}`,
    locationData,
    config.location.cacheTTL
  );
}

async function getRiderAvailability(projectRef, riderId) {
  return getStore().get(`rider:availability:${projectRef}:${riderId}`);
}

async function setRiderOffline(projectRef, riderId) {
  await getStore().set(`rider:offline:${projectRef}:${riderId}`, true, 86400);
}

async function setRiderOnline(projectRef, riderId) {
  await getStore().delete(`rider:offline:${projectRef}:${riderId}`);
}

async function isRiderOffline(projectRef, riderId) {
  const val = await getStore().get(`rider:offline:${projectRef}:${riderId}`);
  return !!val;
}

async function cacheDeliverySearchRadius(deliveryId, radiusKm, ttlSeconds = 3600) {
  await getStore().set(`delivery:radius:${deliveryId}`, { radiusKm }, ttlSeconds);
}

async function getDeliverySearchRadius(deliveryId) {
  const entry = await getStore().get(`delivery:radius:${deliveryId}`);
  return entry?.radiusKm ?? null;
}

module.exports = {
  getStore,
  createAdminSession,
  getAdminSession,
  deleteAdminSession,
  createSuperadminSession,
  getSuperadminSession,
  deleteSuperadminSession,
  createCustomerSession,
  getCustomerSession,
  deleteCustomerSession,
  createTalentSession,
  getTalentSession,
  deleteTalentSession,
  setOTP,
  getOTP,
  incrementOTPAttempts,
  deleteOTP,
  checkOTPRateLimit,
  setCustomerRecoveryOTP,
  getCustomerRecoveryOTP,
  incrementCustomerRecoveryOTPAttempts,
  deleteCustomerRecoveryOTP,
  checkCustomerRecoveryRateLimit,
  setResetToken,
  getResetToken,
  deleteResetToken,
  cacheRiderLocation,
  getRiderLocation,
  flushLocationCache,
  checkLocationRateLimit,
  cacheRiderAvailability,
  getRiderAvailability,
  setRiderOffline,
  setRiderOnline,
  isRiderOffline,
  cacheDeliverySearchRadius,
  getDeliverySearchRadius,
};