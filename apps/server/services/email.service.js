'use strict';

const config = require('../config');
const logger = require('../lib/logger');
const messagingProvider = require('./messaging-provider');
const { formatMoneyCents } = require('../lib/format-money');

function isEmailConfigured() {
  return Boolean(config.email && config.email.enabled && config.email.provider === 'resend');
}

/**
 * Send a transactional email.
 * Falls back to console.log when provider is not configured.
 *
 * Phase 06: delivery runs through the canonical messaging capability
 * (services/messaging-provider.js — Resend adapter, correlation-key
 * idempotency, delivery records, honest health). This wrapper preserves the
 * historical contract: same arguments (plus optional pass-through
 * `organizationId` / `correlationId`), same dev-fallback return, throws on
 * failure. Logs carry correlation ids only — never recipient PII.
 */
async function sendEmail({ to, subject, html, text, organizationId = null, correlationId = null }) {
  if (!isEmailConfigured()) {
    logger.warn('[EMAIL FALLBACK] Would send email');
    if (process.env.NODE_ENV !== 'test') {
      console.log('--- EMAIL ---');
      console.log(`To: ${to}`);
      console.log(`Subject: ${subject}`);
      console.log(text || html);
      console.log('-------------');
    }
    return { id: 'dev-fallback', status: 'logged' };
  }

  try {
    const result = await messagingProvider.sendEmail({
      organizationId,
      to,
      subject,
      html,
      text,
      correlationId,
    });
    return {
      id: result.providerMessageId,
      providerMessageId: result.providerMessageId,
      status: result.status,
      raw: result.raw,
    };
  } catch (err) {
    logger.error('Email send failed', {
      code: err.code || null,
      statusCode: err.statusCode || null,
    });
    throw err;
  }
}

// ─── Email Templates ──────────────────────────────────────────────────────────

function passwordResetEmail(resetUrl) {
  return {
    subject: 'Reset your Dilivygo password',
    html: `
      <h2>Password Reset</h2>
      <p>Click the link below to reset your password. This link expires in 1 hour.</p>
      <a href="${resetUrl}" style="background:#000;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;">
        Reset Password
      </a>
      <p>If you didn't request this, ignore this email.</p>
    `,
    text: `Reset your password: ${resetUrl}\n\nThis link expires in 1 hour.`,
  };
}

function customerOtpEmail(code) {
  return {
    subject: 'Your Dilivygo verification code',
    html: `
      <h2>Verify your sign in</h2>
      <p>Your Dilivygo verification code is:</p>
      <p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:16px 0;">${code}</p>
      <p>This code expires in 5 minutes.</p>
      <p>If you did not request this code, you can safely ignore this email.</p>
    `,
    text: `Your Dilivygo verification code is ${code}. It expires in 5 minutes.`,
  };
}

function customerRecoveryEmail(code) {
  return {
    subject: 'Recover your Dilivygo account',
    html: `
      <h2>Account recovery code</h2>
      <p>Use this code to recover your Dilivygo customer account and update your phone number:</p>
      <p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:16px 0;">${code}</p>
      <p>This code expires in 5 minutes.</p>
      <p>If you did not request this, you can ignore this email.</p>
    `,
    text: `Your Dilivygo account recovery code is ${code}. It expires in 5 minutes.`,
  };
}

function refundConfirmationEmail(order, refundAmount) {
  const currency = order.currency || 'GBP';
  const formatted = formatMoneyCents(refundAmount, currency);
  return {
    subject: `Refund confirmed for order #${order.id.slice(0, 8).toUpperCase()}`,
    html: `
      <h2>Your refund has been processed</h2>
      <p>Order: #${order.id.slice(0, 8).toUpperCase()}</p>
      <p>Refund amount: ${formatted}</p>
      <p>Please allow 5-10 business days for the funds to appear in your account.</p>
    `,
    text: `Refund of ${formatted} processed for order #${order.id.slice(0, 8).toUpperCase()}.`,
  };
}

function orderCancellationEmail(order, reason) {
  return {
    subject: `Your order #${order.id.slice(0, 8).toUpperCase()} has been cancelled`,
    html: `
      <h2>Order Cancelled</h2>
      <p>Your order #${order.id.slice(0, 8).toUpperCase()} has been cancelled.</p>
      ${reason ? `<p>Reason: ${reason}</p>` : ''}
      ${order.payment_status === 'paid' ? '<p>A full refund has been issued and will appear in 5-10 business days.</p>' : ''}
    `,
    text: `Order #${order.id.slice(0, 8).toUpperCase()} cancelled.${reason ? ` Reason: ${reason}` : ''}`,
  };
}

module.exports = {
  sendEmail,
  passwordResetEmail,
  customerOtpEmail,
  customerRecoveryEmail,
  refundConfirmationEmail,
  orderCancellationEmail,
};
