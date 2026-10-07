'use strict';

const logger = require('../lib/logger');
const config = require('../config');

/**
 * 404 handler — must be registered AFTER all routes.
 */
function notFound(req, res) {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
}

/**
 * Global error handler — must be registered last with 4 params.
 */
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const statusCode = err.statusCode || err.status || 500;
  // Dependency outages (Supabase unreachable, egress flap) are operational, not
  // bugs: the request is well-formed and retrying it can succeed. Treating them
  // as unexpected 500s hid the real reason behind a generic message and sent
  // every transient blip to Sentry as an unhandled exception.
  const isDependencyOutage = statusCode === 503 || err.code === 'SUPABASE_UNAVAILABLE';
  const isOperational = err.isOperational || statusCode < 500 || isDependencyOutage;

  const logPayload = {
    requestId: req.id,
    method: req.method,
    path: req.path,
    statusCode,
    code: err.code,
    message: err.message,
    stack: config.isProd ? undefined : err.stack,
  };

  if (isDependencyOutage && err.transient) {
    logPayload.transient = true;
    logger.warn('Request failed — dependency unavailable', logPayload);
  } else {
    logger.error('Request error', logPayload);
  }

  const body = {
    error: isOperational ? err.message : 'An unexpected error occurred',
  };

  if (isDependencyOutage) body.retryable = true;

  if (!config.isProd && err.stack) {
    body.stack = err.stack;
  }

  res.status(statusCode).json(body);
}

/**
 * Create an operational error with a specific HTTP status code.
 */
function createError(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.isOperational = true;
  return err;
}

module.exports = { notFound, errorHandler, createError };
