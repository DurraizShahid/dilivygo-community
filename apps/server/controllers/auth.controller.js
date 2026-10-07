'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { totp } = require('otplib');
const qrcode = require('qrcode');

const config = require('../config');
const userModel = require('../models/user.model');
const customerModel = require('../models/customer.model');
const sessionService = require('../services/session.service');
const { sendSMS, generateOTP } = require('../services/sms.service');
const {
  sendEmail,
  passwordResetEmail,
  customerOtpEmail,
  customerRecoveryEmail,
} = require('../services/email.service');
const { writeAuditLog } = require('../lib/audit');
const { organizationIdByProjectRef } = require('../lib/audit-org');
const {
  resolveAuthHostScope,
  staffHostMismatchResponse,
} = require('../lib/host-scope');
const logger = require('../lib/logger');

async function auditOrgStaff(user) {
  if (!user) return null;
  if (user.organization_id) return user.organization_id;
  if (user.project_ref) return organizationIdByProjectRef(String(user.project_ref));
  return null;
}

async function auditOrgCustomer(customer) {
  if (!customer) return null;
  if (customer.organization_id) return customer.organization_id;
  if (customer.project_ref) return organizationIdByProjectRef(String(customer.project_ref));
  return null;
}
const platformSettings = require('../models/platform-settings.model');
const { uploadImage, deleteImage } = require('../lib/storage');
const {
  MARKETPLACE_CUSTOMER_SCOPE,
  MARKETPLACE_ORGANIZATION_ID,
} = require('../lib/platform-constants');
const { resolveOrganizationContext } = require('../lib/organization-context');

function otpTenantKey(projectRef) {
  const t = projectRef != null ? String(projectRef).trim() : '';
  return t || MARKETPLACE_CUSTOMER_SCOPE;
}

/**
 * Resolve the organization bucket for a customer-auth request. Prefers explicit
 * `organizations.public_ref` but accepts a workspace `project_ref` for legacy callers.
 * Falls back to the synthetic marketplace organization so auth never 500s on bad input.
 *
 * @param {string|null|undefined} ref
 * @returns {Promise<{ organizationId: string, otpScope: string }>}
 */
async function resolveCustomerOrgScope(ref) {
  const raw = typeof ref === 'string' ? ref.trim() : '';
  if (!raw) {
    // Must match the otpScope used when `projectRef` is `_marketplace` (see
    // `resolveOrganizationContext(MARKETPLACE_PUBLIC_REF)`), otherwise send and
    // verify hit different Redis keys for the same deployment default.
    return {
      organizationId: MARKETPLACE_ORGANIZATION_ID,
      otpScope: `org:${MARKETPLACE_ORGANIZATION_ID}`,
    };
  }
  const ctx = await resolveOrganizationContext(raw);
  if (!ctx) {
    return { organizationId: MARKETPLACE_ORGANIZATION_ID, otpScope: `org:${MARKETPLACE_ORGANIZATION_ID}` };
  }
  return { organizationId: ctx.organizationId, otpScope: `org:${ctx.organizationId}` };
}

const COOKIE_BASE = {
  httpOnly: true,
  secure: config.isProd,
  sameSite: config.isProd ? 'none' : 'lax',
  path: '/',
};

function resolveOtpChannel({ channel, phone, email }) {
  if (channel) return channel;
  const hasPhone = Boolean(phone);
  const emailStr = typeof email === 'string' ? email.trim() : '';
  const hasEmail = emailStr.length > 0;
  if (hasPhone) return 'phone';
  if (hasEmail) return 'email';
  return null;
}

function publicCustomer(row) {
  if (!row) return null;
  return {
    id: row.id,
    phone: row.phone,
    name: row.name,
    email: row.email,
    projectRef: row.project_ref,
    organizationId: row.organization_id || null,
    avatarUrl: row.avatar_url || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function customerSessionPayload(row) {
  return {
    id: row.id,
    phone: row.phone,
    email: row.email,
    name: row.name,
    projectRef: row.project_ref,
    organizationId: row.organization_id || null,
    organization_id: row.organization_id || null,
    avatarUrl: row.avatar_url ?? null,
    type: 'customer',
  };
}

function customerJwtPayload(customerRow) {
  return {
    id: customerRow.id,
    phone: customerRow.phone,
    email: customerRow.email,
    name: customerRow.name,
    projectRef: customerRow.project_ref,
    organizationId: customerRow.organization_id || null,
    avatarUrl: customerRow.avatar_url || undefined,
    type: 'customer',
  };
}

async function refreshCustomerWebSession(req, res, row) {
  if (!req.customerSessionId) return;
  const newSessionId = await sessionService.createCustomerSession(customerSessionPayload(row));
  await sessionService.deleteCustomerSession(req.customerSessionId);
  res.cookie('customer_session', newSessionId, {
    ...COOKIE_BASE,
    maxAge: config.session.customerTTL * 1000,
  });
}

function optionalFreshCustomerToken(req, row) {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return jwt.sign(customerJwtPayload(row), config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
    });
  }
  return undefined;
}

// ─── Admin Auth ───────────────────────────────────────────────────────────────

function staffJwtPayload(user) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    projectRef: user.project_ref,
    name: userModel.staffSessionDisplayName(user),
    type: 'admin',
  };
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    // Resolve the tenant scope of the request up front. Staff email
    // uniqueness is per-organization (see migration 082), so on a tenant
    // host we must look up the staff row inside the right org bucket —
    // otherwise a user whose email collides with a user in another org would
    // get the wrong row (and always fail the host-mismatch check below).
    const hostScope = await resolveAuthHostScope(req);
    const user = hostScope?.organizationId
      ? await userModel.findByEmailInOrganization(email, hostScope.organizationId)
      : await userModel.findByEmail(email);

    const passwordOk = user ? await userModel.verifyPassword(user, password) : false;

    if (!user || !passwordOk) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Reject cross-tenant logins: when the request host resolves to a known
    // workspace / organization, the staff account must belong to it. Only
    // enforced when the host actually maps to a tenant (preserves dev /
    // direct-API workflows where SAAS_DNS_APEX is unset).
    const userOrgId = await auditOrgStaff(user);
    const mismatch = staffHostMismatchResponse(user, hostScope, userOrgId);
    if (mismatch) {
      await writeAuditLog({
        userId: user.id,
        action: 'auth.login_rejected_wrong_host',
        ip: req.ip,
        organizationId: userOrgId,
        details: {
          host: req.headers['x-forwarded-host'] || req.headers.host || null,
          code: mismatch.body.code,
        },
      });
      return res.status(mismatch.status).json(mismatch.body);
    }

    if (user.totp_enabled) {
      // Return a short-lived pre-auth token instead of a full session. We bind
      // the pre-auth token to the host scope so step 2 (TOTP verify) cannot be
      // replayed on a different tenant host.
      const preAuthToken = jwt.sign(
        {
          userId: user.id,
          step: 'totp',
          type: 'pre_auth',
          hostOrgId: hostScope?.organizationId || null,
          hostProjectRef: hostScope?.workspaceProjectRef || null,
        },
        config.jwt.secret,
        { expiresIn: '5m' }
      );
      return res.json({ requiresTwoFactor: true, preAuthToken });
    }

    const sessionId = await sessionService.createAdminSession({
      id: user.id,
      email: user.email,
      role: user.role,
      projectRef: user.project_ref,
      name: userModel.staffSessionDisplayName(user),
      type: 'admin',
    });

    res.cookie('admin_session', sessionId, { ...COOKIE_BASE, maxAge: config.session.adminTTL * 1000 });

    await writeAuditLog({
      userId: user.id,
      action: 'auth.login',
      ip: req.ip,
      organizationId: await auditOrgStaff(user),
    });

    const token = jwt.sign(staffJwtPayload(user), config.jwt.secret, {
      expiresIn: config.session.adminTTL,
    });

    return res.json({ user: userModel.toPublicStaffUser(user), token });
  } catch (err) {
    next(err);
  }
}

async function logout(req, res, next) {
  try {
    if (req.sessionId) {
      await sessionService.deleteAdminSession(req.sessionId);
    }
    res.clearCookie('admin_session', COOKIE_BASE);
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function getSession(req, res) {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const user = await userModel.findById(req.user.id);
  return res.json({ user: userModel.toPublicStaffUser(user) });
}

async function signup(req, res, next) {
  try {
    const { email, password, role, projectRef, name, firstName, lastName } = req.body;

    // Staff email uniqueness is per-organization (see migration 082). Resolve
    // the target org from the workspace so the duplicate check is scoped to
    // the tenant that will own the new account.
    const organizationId = projectRef
      ? await organizationIdByProjectRef(String(projectRef))
      : null;
    const existing = organizationId
      ? await userModel.findByEmailInOrganization(email, organizationId)
      : await userModel.findByEmail(email);
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const displayName = name != null && String(name).trim() !== '' ? String(name).trim() : null;
    const user = await userModel.create({
      email,
      password,
      role,
      projectRef,
      displayName,
      firstName,
      lastName,
    });
    await writeAuditLog({
      userId: user.id,
      action: 'auth.signup',
      ip: req.ip,
      organizationId: await auditOrgStaff(user),
    });

    return res.status(201).json({ user: userModel.toPublicStaffUser(user) });
  } catch (err) {
    next(err);
  }
}

// ─── Password Reset ───────────────────────────────────────────────────────────

async function forgotPassword(req, res, next) {
  try {
    const { email } = req.body;

    // Scope the lookup to the tenant this request is served on. Mirrors the
    // per-org uniqueness introduced in migration 082: on a tenant host, the
    // reset email must go to the account in *that* org, not to whichever row
    // happens to come back first from a global scan.
    const hostScope = await resolveAuthHostScope(req);
    const user = hostScope?.organizationId
      ? await userModel.findByEmailInOrganization(email, hostScope.organizationId)
      : await userModel.findByEmail(email);

    // Always return 200 to prevent user enumeration
    if (!user) return res.json({ ok: true });

    const token = crypto.randomBytes(32).toString('hex');
    await sessionService.setResetToken(token, { userId: user.id, email: user.email });

    const resetUrl = `${req.headers.origin || 'https://app.dilivygo.com'}/reset-password?token=${token}`;
    const template = passwordResetEmail(resetUrl);
    await sendEmail({ to: email, ...template });

    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function resetPassword(req, res, next) {
  try {
    const { token, password } = req.body;
    const tokenData = await sessionService.getResetToken(token);

    if (!tokenData) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    await userModel.updatePassword(tokenData.userId, password);
    await sessionService.deleteResetToken(token);

    const staffForAudit = await userModel.findById(tokenData.userId);
    await writeAuditLog({
      userId: tokenData.userId,
      action: 'auth.password_reset',
      ip: req.ip,
      organizationId: await auditOrgStaff(staffForAudit),
    });

    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

// ─── Customer OTP Auth ────────────────────────────────────────────────────────

async function sendOTP(req, res, next) {
  try {
    const { phone, email, projectRef } = req.body;
    const channel = resolveOtpChannel(req.body);
    const recipient = channel === 'email' ? String(email).trim().toLowerCase() : phone;
    const { organizationId, otpScope: scope } = await resolveCustomerOrgScope(projectRef);

    const allowed = await sessionService.checkOTPRateLimit({
      channel,
      recipient,
      projectRef: scope,
    });
    if (!allowed) {
      return res.status(429).json({
        error: 'Too many OTP requests. Please wait 15 minutes before trying again.',
      });
    }

    if (channel === 'email') {
      // Email sign-up/sign-in: allow new accounts to be created via email OTP.
      // No need to check for existing account — account will be created on verify if needed.
    }

    const code = generateOTP();
    await sessionService.setOTP({ channel, recipient, projectRef: scope }, code);

    const smsBody = `Your Dilivygo verification code is: ${code}. It expires in 5 minutes.`;
    const emailTemplate = customerOtpEmail(code);

    // In local/dev we don't want OTP testing blocked when Twilio/email is not configured.
    // We always store the OTP in the session store; if delivery throws, we return `debugOtp`
    // for testing only. Do not use a short Promise.race timeout: Twilio/Resend often take
    // >5s on slow mobile networks, which incorrectly looked like a timeout and exposed
    // debug OTP while the real SMS was still in flight.
    let deliveryFailed = false;
    const debugAllowed = !config.isProd;

    if (debugAllowed) {
      try {
        if (channel === 'email') {
          await sendEmail({ to: recipient, ...emailTemplate });
        } else {
          await sendSMS({ to: recipient, body: smsBody });
        }
      } catch {
        deliveryFailed = true;
      }
    } else {
      if (channel === 'email') {
        await sendEmail({ to: recipient, ...emailTemplate });
      } else {
        await sendSMS({ to: recipient, body: smsBody });
      }
    }

    const debugOtp = debugAllowed
      && (
        (channel === 'email' && (!config.email.enabled || deliveryFailed))
        || (channel === 'phone' && (!config.twilio.enabled || deliveryFailed))
      )
      ? code
      : undefined;

    return res.json({ ok: true, channel, ...(debugOtp ? { debugOtp } : {}) });
  } catch (err) {
    next(err);
  }
}

async function verifyOTP(req, res, next) {
  try {
    const { phone, email, code, projectRef, name } = req.body;
    const channel = resolveOtpChannel(req.body);
    const recipient = channel === 'email' ? String(email).trim().toLowerCase() : phone;
    const { organizationId, otpScope: scope } = await resolveCustomerOrgScope(projectRef);

    const otpEntry = await sessionService.getOTP({
      channel,
      recipient,
      projectRef: scope,
    });
    if (!otpEntry) {
      return res.status(400).json({
        error: 'OTP expired or not found. Please request a new code.',
        code: 'OTP_NOT_FOUND',
      });
    }

    if (otpEntry.attempts >= config.otp.maxAttempts) {
      await sessionService.deleteOTP({ channel, recipient, projectRef: scope });
      return res.status(400).json({
        error: 'Too many incorrect attempts. Please request a new code.',
        code: 'OTP_LOCKED',
      });
    }

    if (String(otpEntry.code) !== String(code)) {
      await sessionService.incrementOTPAttempts({ channel, recipient, projectRef: scope }, otpEntry);
      return res.status(400).json({
        error: 'Incorrect verification code',
        code: 'OTP_MISMATCH',
      });
    }

    await sessionService.deleteOTP({ channel, recipient, projectRef: scope });

    let customer;
    let created = false;

    if (channel === 'email') {
      const result = await customerModel.findOrCreateByEmailInOrganization({ email: recipient, organizationId });
      customer = result.customer;
      created = result.created;
    } else {
      const result = await customerModel.findOrCreateInOrganization({ phone, organizationId });
      customer = result.customer;
      created = result.created;
    }

    const linkEmail =
      channel === 'phone' && typeof email === 'string' && email.trim()
        ? email.trim().toLowerCase()
        : '';
    const trimmedName = typeof name === 'string' ? name.trim() : '';

    if (channel === 'phone') {
      if (created && (trimmedName || linkEmail)) {
        const patch = {};
        if (trimmedName) patch.name = trimmedName;
        if (linkEmail) {
          const taken = await customerModel.findByEmailInOrganization(linkEmail, organizationId);
          if (taken && taken.id !== customer.id) {
            return res.status(409).json({
              error: 'That email is already linked to another customer account.',
            });
          }
          patch.email = linkEmail;
        }
        await customerModel.updateProfile(customer.id, patch);
        customer = await customerModel.findById(customer.id);
      } else if (!created && linkEmail) {
        const current = String(customer.email || '').toLowerCase();
        if (linkEmail !== current) {
          const taken = await customerModel.findByEmailInOrganization(linkEmail, organizationId);
          if (taken && taken.id !== customer.id) {
            return res.status(409).json({
              error: 'That email is already linked to another customer account.',
            });
          }
          await customerModel.updateProfile(customer.id, { email: linkEmail });
          customer = await customerModel.findById(customer.id);
        }
      }
    } else if (channel === 'email' && created && trimmedName) {
      await customerModel.updateProfile(customer.id, { name: trimmedName });
      customer = await customerModel.findById(customer.id);
    }

    const sessionId = await sessionService.createCustomerSession(customerSessionPayload(customer));

    res.cookie('customer_session', sessionId, {
      ...COOKIE_BASE,
      maxAge: config.session.customerTTL * 1000,
    });

    const token = jwt.sign(customerJwtPayload(customer), config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
    });

    await writeAuditLog({
      userId: customer.id,
      action: created ? 'auth.customer_signup' : 'auth.customer_otp_signin',
      resourceType: 'customer',
      resourceId: customer.id,
      details: { channel },
      ip: req.ip,
      organizationId: await auditOrgCustomer(customer),
    });

    return res.status(created ? 201 : 200).json({
      customer: publicCustomer(customer),
      created,
      token,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Demo-only OTP bypass for the customer web + customer mobile login.
 *
 * Hard-gated by the global `platform_settings.demo_mode` flag. When demo_mode
 * is OFF (production default), this endpoint returns 403 regardless of input,
 * so a tampered client that sets `skipOtp: true` cannot bypass OTP on a real
 * deployment. When demo_mode is ON, behaves exactly like a successful OTP
 * verify: find-or-create the org-scoped customer, issue `customer_session`
 * cookie + JWT. Every invocation writes a distinct audit_log row so demo
 * bypasses always leave a trail.
 */
async function customerDemoLogin(req, res, next) {
  try {
    const demoModeRaw = await platformSettings.get('demo_mode');
    if (demoModeRaw !== 'true') {
      return res.status(403).json({
        error: 'Demo mode is disabled. OTP verification is required.',
        code: 'DEMO_MODE_DISABLED',
      });
    }

    const { phone, email, projectRef, name } = req.body;
    const channel = resolveOtpChannel(req.body);
    if (!channel) {
      return res.status(400).json({ error: 'Provide exactly one of phone or email' });
    }

    const { organizationId } = await resolveCustomerOrgScope(projectRef);

    let customer;
    let created = false;

    if (channel === 'email') {
      const recipient = String(email).trim().toLowerCase();
      const result = await customerModel.findOrCreateByEmailInOrganization({
        email: recipient,
        organizationId,
      });
      customer = result.customer;
      created = result.created;
    } else {
      const result = await customerModel.findOrCreateInOrganization({ phone, organizationId });
      customer = result.customer;
      created = result.created;
    }

    const trimmedName = typeof name === 'string' ? name.trim() : '';
    if (created && trimmedName) {
      await customerModel.updateProfile(customer.id, { name: trimmedName });
      customer = await customerModel.findById(customer.id);
    }

    const sessionId = await sessionService.createCustomerSession(customerSessionPayload(customer));

    res.cookie('customer_session', sessionId, {
      ...COOKIE_BASE,
      maxAge: config.session.customerTTL * 1000,
    });

    const token = jwt.sign(customerJwtPayload(customer), config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
    });

    const auditOrg = await auditOrgCustomer(customer);
    await writeAuditLog({
      userId: customer.id,
      action: 'auth.customer_demo_login',
      resourceType: 'customer',
      resourceId: customer.id,
      details: { channel, created },
      ip: req.ip,
      organizationId: auditOrg,
    });

    // Leave a breadcrumb in Railway logs so on-call notices if demo_mode is
    // ever accidentally enabled on a production deployment.
    logger.warn('Customer demo login issued (OTP bypassed)', {
      customerId: customer.id,
      organizationId: auditOrg,
      channel,
      created,
    });

    return res.status(created ? 201 : 200).json({
      customer: publicCustomer(customer),
      created,
      token,
      demo: true,
    });
  } catch (err) {
    next(err);
  }
}

async function getCustomerSession(req, res) {
  if (!req.customer) return res.status(401).json({ error: 'Not authenticated' });
  const customer = await customerModel.findById(req.customer.id);
  return res.json({ customer: publicCustomer(customer) });
}

async function customerLogout(req, res, next) {
  try {
    if (req.customer?.id) {
      await writeAuditLog({
        userId: req.customer.id,
        action: 'auth.customer_logout',
        resourceType: 'customer',
        resourceId: req.customer.id,
        ip: req.ip,
        organizationId: await auditOrgCustomer(req.customer),
      });
    }
    if (req.customerSessionId) {
      await sessionService.deleteCustomerSession(req.customerSessionId);
    }
    res.clearCookie('customer_session', COOKIE_BASE);
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function updateCustomerProfile(req, res, next) {
  try {
    const customerId = req.customer?.id;
    if (!customerId) {
      return res.status(401).json({ error: 'Customer authentication required' });
    }

    const name = typeof req.body.name === 'string' ? req.body.name.trim() : undefined;
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : undefined;

    if (email) {
      // SECURITY (audit finding #7): never fall back to the legacy
      // project_ref-only lookup — that bypasses the per-organization
      // phone/email uniqueness contract. Resolve the org from the persisted
      // customer row when the session payload is missing it (legacy
      // sessions issued before migration 077). When no org can be resolved
      // (truly orphaned customer row), skip the application-level dedup
      // check and rely on the DB unique constraint
      // `customers (email, organization_id)`.
      let orgId = req.customer?.organizationId || req.customer?.organization_id || null;
      if (!orgId) {
        const persisted = await customerModel.findById(customerId);
        orgId = persisted?.organization_id || null;
      }
      if (orgId) {
        const existing = await customerModel.findByEmailInOrganization(email, orgId);
        if (existing && existing.id !== customerId) {
          return res.status(409).json({ error: 'That email is already linked to another customer account.' });
        }
      }
    }

    await customerModel.updateProfile(customerId, { name, email });
    const updatedCustomer = await customerModel.findById(customerId);

    if (!updatedCustomer) {
      return res.status(404).json({ error: 'Customer account not found' });
    }

    await refreshCustomerWebSession(req, res, updatedCustomer);

    return res.json({
      customer: publicCustomer(updatedCustomer),
      token: optionalFreshCustomerToken(req, updatedCustomer),
    });
  } catch (err) {
    next(err);
  }
}

async function sendCustomerRecoveryOTP(req, res, next) {
  try {
    const { email, projectRef } = req.body;
    const normalizedEmail = String(email).trim().toLowerCase();
    const { organizationId, otpScope: scope } = await resolveCustomerOrgScope(projectRef);

    const allowed = await sessionService.checkCustomerRecoveryRateLimit({
      email: normalizedEmail,
      projectRef: scope,
    });
    if (!allowed) {
      return res.status(429).json({
        error: 'Too many recovery requests. Please wait 15 minutes before trying again.',
      });
    }

    const customer = await customerModel.findByEmailInOrganization(normalizedEmail, organizationId);
    // Prevent customer account enumeration
    if (!customer) return res.json({ ok: true });

    const code = generateOTP();
    await sessionService.setCustomerRecoveryOTP({ email: normalizedEmail, projectRef: scope }, code);

    const debugAllowed = !config.isProd;
    const template = customerRecoveryEmail(code);
    let deliveryFailed = false;

    if (debugAllowed) {
      try {
        await sendEmail({ to: normalizedEmail, ...template });
      } catch {
        deliveryFailed = true;
      }
    } else {
      await sendEmail({ to: normalizedEmail, ...template });
    }

    const debugOtp = debugAllowed && (!config.email.enabled || deliveryFailed)
      ? code
      : undefined;

    return res.json({ ok: true, ...(debugOtp ? { debugOtp } : {}) });
  } catch (err) {
    next(err);
  }
}

async function verifyCustomerRecoveryOTP(req, res, next) {
  try {
    const { email, projectRef, code, newPhone } = req.body;
    const normalizedEmail = String(email).trim().toLowerCase();
    const { organizationId, otpScope: scope } = await resolveCustomerOrgScope(projectRef);

    const otpEntry = await sessionService.getCustomerRecoveryOTP({
      email: normalizedEmail,
      projectRef: scope,
    });
    if (!otpEntry) {
      return res.status(400).json({ error: 'Recovery code expired or not found. Please request a new code.' });
    }

    if (otpEntry.attempts >= config.otp.maxAttempts) {
      await sessionService.deleteCustomerRecoveryOTP({ email: normalizedEmail, projectRef: scope });
      return res.status(400).json({ error: 'Too many incorrect attempts. Please request a new code.' });
    }

    if (String(otpEntry.code) !== String(code)) {
      await sessionService.incrementCustomerRecoveryOTPAttempts(
        { email: normalizedEmail, projectRef: scope },
        otpEntry
      );
      return res.status(400).json({ error: 'Incorrect recovery code' });
    }

    await sessionService.deleteCustomerRecoveryOTP({ email: normalizedEmail, projectRef: scope });

    const customer = await customerModel.findByEmailInOrganization(normalizedEmail, organizationId);
    if (!customer) {
      return res.status(400).json({ error: 'Customer account not found for this recovery request.' });
    }

    const existingByPhone = await customerModel.findByPhoneInOrganization(newPhone, organizationId);
    if (existingByPhone && existingByPhone.id !== customer.id) {
      return res.status(409).json({ error: 'That phone number is already used by another customer account.' });
    }

    await customerModel.updatePhone(customer.id, newPhone);
    const updatedCustomer = await customerModel.findById(customer.id);

    const sessionId = await sessionService.createCustomerSession(customerSessionPayload(updatedCustomer));

    res.cookie('customer_session', sessionId, {
      ...COOKIE_BASE,
      maxAge: config.session.customerTTL * 1000,
    });

    const token = jwt.sign(customerJwtPayload(updatedCustomer), config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
    });

    await writeAuditLog({
      userId: updatedCustomer.id,
      action: 'auth.customer_recovery',
      ip: req.ip,
      organizationId: await auditOrgCustomer(updatedCustomer),
    });

    return res.json({
      customer: publicCustomer(updatedCustomer),
      recovered: true,
      token,
    });
  } catch (err) {
    next(err);
  }
}

// ─── 2FA (TOTP) ───────────────────────────────────────────────────────────────

async function setup2FA(req, res, next) {
  try {
    const user = await userModel.findById(req.user.id);
    if (!(await userModel.verifyPassword(user, req.body.password))) {
      return res.status(401).json({ error: 'Incorrect password' });
    }

    const secret = totp.generateSecret();
    const otpAuthUrl = totp.keyuri(user.email, 'Dilivygo', secret);
    const qrDataUrl = await qrcode.toDataURL(otpAuthUrl);

    // Store secret temporarily — will be confirmed in verify2FA
    await sessionService.getStore().set(
      `totp:setup:${user.id}`,
      { secret },
      300 // 5 minutes to complete setup
    );

    return res.json({ qrCode: qrDataUrl, secret });
  } catch (err) {
    next(err);
  }
}

async function verify2FA(req, res, next) {
  try {
    const setup = await sessionService.getStore().get(`totp:setup:${req.user.id}`);
    if (!setup) return res.status(400).json({ error: '2FA setup session expired' });

    const isValid = totp.verify({ token: req.body.token, secret: setup.secret });
    if (!isValid) return res.status(400).json({ error: 'Invalid TOTP token' });

    await userModel.enableTOTP(req.user.id, setup.secret);
    await sessionService.getStore().delete(`totp:setup:${req.user.id}`);

    await writeAuditLog({
      userId: req.user.id,
      action: 'auth.2fa_enabled',
      ip: req.ip,
      organizationId: await auditOrgStaff(await userModel.findById(req.user.id)),
    });

    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function uploadCustomerAvatar(req, res, next) {
  try {
    const existingEarly = req.customer?.id ? await customerModel.findById(req.customer.id) : null;
    const refEarly = existingEarly?.project_ref ? String(existingEarly.project_ref) : null;
    if (
      (await platformSettings.get('customer_profile_photo_enabled', refEarly ? { projectRef: refEarly } : undefined)) ===
      'false'
    ) {
      return res.status(403).json({ error: 'Profile photo uploads are disabled for this platform.' });
    }
    if (!req.file?.buffer) {
      return res.status(400).json({ error: 'No image uploaded' });
    }
    const customerId = req.customer?.id;
    if (!customerId) {
      return res.status(401).json({ error: 'Customer authentication required' });
    }

    const existing = existingEarly || (await customerModel.findById(customerId));
    if (!existing) {
      return res.status(404).json({ error: 'Customer account not found' });
    }

    const prevUrl = existing.avatar_url;
    const url = await uploadImage(req.file.buffer, req.file.mimetype, 'customer-avatars');
    if (prevUrl) await deleteImage(prevUrl);

    await customerModel.updateById(customerId, {
      avatar_url: url,
      updated_at: new Date().toISOString(),
    });
    const updated = await customerModel.findById(customerId);

    await refreshCustomerWebSession(req, res, updated);

    return res.json({
      customer: publicCustomer(updated),
      token: optionalFreshCustomerToken(req, updated),
    });
  } catch (err) {
    next(err);
  }
}

async function deleteCustomerAvatar(req, res, next) {
  try {
    const customerId = req.customer?.id;
    if (!customerId) {
      return res.status(401).json({ error: 'Customer authentication required' });
    }

    const existing = await customerModel.findById(customerId);
    if (!existing) {
      return res.status(404).json({ error: 'Customer account not found' });
    }

    if (existing.avatar_url) await deleteImage(existing.avatar_url);

    await customerModel.updateById(customerId, {
      avatar_url: null,
      updated_at: new Date().toISOString(),
    });
    const updated = await customerModel.findById(customerId);

    await refreshCustomerWebSession(req, res, updated);

    return res.json({
      customer: publicCustomer(updated),
      token: optionalFreshCustomerToken(req, updated),
    });
  } catch (err) {
    next(err);
  }
}

async function login2FA(req, res, next) {
  try {
    const { sessionToken, totpToken } = req.body;
    let payload;
    try {
      payload = jwt.verify(sessionToken, config.jwt.secret);
    } catch {
      return res.status(400).json({ error: 'Invalid or expired pre-auth token' });
    }

    if (payload.step !== 'totp') return res.status(400).json({ error: 'Invalid token type' });

    const user = await userModel.findById(payload.userId);
    if (!user?.totp_enabled) return res.status(400).json({ error: '2FA not configured' });

    const isValid = totp.verify({ token: totpToken, secret: user.totp_secret });
    if (!isValid) return res.status(400).json({ error: 'Invalid TOTP code' });

    // Re-verify host scope here too: a stolen pre-auth token must not become a
    // session on a tenant host the user does not belong to. We compare both
    // the live host scope AND the scope embedded in the pre-auth token (set in
    // step 1) so the user cannot move between hosts mid-flow.
    const hostScope = await resolveAuthHostScope(req);
    const userOrgId = await auditOrgStaff(user);
    const mismatch = staffHostMismatchResponse(user, hostScope, userOrgId);
    if (mismatch) {
      await writeAuditLog({
        userId: user.id,
        action: 'auth.2fa_rejected_wrong_host',
        ip: req.ip,
        organizationId: userOrgId,
        details: {
          host: req.headers['x-forwarded-host'] || req.headers.host || null,
          code: mismatch.body.code,
        },
      });
      return res.status(mismatch.status).json(mismatch.body);
    }
    if (
      (payload.hostOrgId && hostScope?.organizationId && String(payload.hostOrgId) !== String(hostScope.organizationId)) ||
      (payload.hostProjectRef && hostScope?.workspaceProjectRef && String(payload.hostProjectRef) !== String(hostScope.workspaceProjectRef))
    ) {
      return res.status(403).json({
        error: 'Two-factor verification must be completed on the same host where you started sign-in.',
        code: 'TENANT_HOST_DRIFTED',
      });
    }

    const sessionId = await sessionService.createAdminSession({
      id: user.id,
      email: user.email,
      role: user.role,
      projectRef: user.project_ref,
      name: userModel.staffSessionDisplayName(user),
      type: 'admin',
    });

    res.cookie('admin_session', sessionId, { ...COOKIE_BASE, maxAge: config.session.adminTTL * 1000 });

    await writeAuditLog({
      userId: user.id,
      action: 'auth.2fa_login',
      ip: req.ip,
      organizationId: await auditOrgStaff(user),
    });

    const token = jwt.sign(staffJwtPayload(user), config.jwt.secret, {
      expiresIn: config.session.adminTTL,
    });

    return res.json({ user: userModel.toPublicStaffUser(user), token });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  login, logout, getSession, signup,
  forgotPassword, resetPassword,
  sendOTP, verifyOTP, customerDemoLogin, getCustomerSession, customerLogout,
  sendCustomerRecoveryOTP, verifyCustomerRecoveryOTP,
  updateCustomerProfile,
  uploadCustomerAvatar,
  deleteCustomerAvatar,
  setup2FA, verify2FA, login2FA,
};
