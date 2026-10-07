'use strict';

const { Router } = require('express');
const authController = require('../controllers/auth.controller');
const { validate } = require('../middleware/validate.middleware');
const { sanitizeBody } = require('../middleware/sanitize.middleware');
const { requireAdmin, requireRole, requireCustomer, parseSession } = require('../middleware/auth.middleware');
const { pinStaffResetOrigin } = require('../middleware/reset-origin.middleware');
const { requireKnownCustomerOrgRef, rejectProductionDemoLogin } = require('../middleware/customer-auth-scope.middleware');
const { imageUpload } = require('../middleware/image-upload.middleware');
const { authLimiter, otpSendLimiter } = require('../middleware/rate-limit.middleware');
const v = require('../validators/auth.validator');

const router = Router();

router.use(authLimiter);

// ─── Admin Auth ───────────────────────────────────────────────────────────────
router.post('/login',           validate(v.loginSchema),           authController.login);
router.post('/logout',          parseSession,                      authController.logout);
router.get('/session',          parseSession, requireAdmin,        authController.getSession);

// Staff accounts are never self-service. SaaS onboarding has its own
// owner/admin-authorized provisioning routes; this legacy endpoint is retained
// only for authenticated workspace administrators that still depend on it.
router.post(
  '/signup',
  parseSession,
  requireAdmin,
  requireRole('admin'),
  validate(v.signupSchema),
  authController.signup,
);

// ─── Password Reset ───────────────────────────────────────────────────────────
router.post(
  '/forgot-password',
  pinStaffResetOrigin,
  validate(v.forgotPasswordSchema),
  authController.forgotPassword,
);
router.post('/reset-password',  validate(v.resetPasswordSchema),   authController.resetPassword);

// ─── Customer OTP Auth ────────────────────────────────────────────────────────
router.post('/otp/send', otpSendLimiter, requireKnownCustomerOrgRef, validate(v.otpSendSchema), authController.sendOTP);
router.post('/otp/verify', requireKnownCustomerOrgRef, sanitizeBody('name'), validate(v.otpVerifySchema), authController.verifyOTP);
router.post(
  '/customer/demo-login',
  rejectProductionDemoLogin,
  otpSendLimiter,
  requireKnownCustomerOrgRef,
  sanitizeBody('name'),
  validate(v.customerDemoLoginSchema),
  authController.customerDemoLogin,
);
router.post('/customer/recovery/send', otpSendLimiter, requireKnownCustomerOrgRef, validate(v.customerRecoverySendSchema), authController.sendCustomerRecoveryOTP);
router.post('/customer/recovery/verify', requireKnownCustomerOrgRef, validate(v.customerRecoveryVerifySchema), authController.verifyCustomerRecoveryOTP);
router.get('/customer/session', parseSession, authController.getCustomerSession);
router.patch('/customer/profile', parseSession, requireCustomer, sanitizeBody('name'), validate(v.customerProfileUpdateSchema), authController.updateCustomerProfile);
router.post('/customer/avatar', parseSession, requireCustomer, imageUpload('photo'), authController.uploadCustomerAvatar);
router.delete('/customer/avatar', parseSession, requireCustomer, authController.deleteCustomerAvatar);
router.post('/customer/logout', parseSession, authController.customerLogout);

// ─── Two-Factor Auth (TOTP) ───────────────────────────────────────────────────
router.post('/2fa/setup',       parseSession, requireAdmin, validate(v.totpSetupSchema), authController.setup2FA);
router.post('/2fa/verify',      parseSession, requireAdmin, validate(v.totpVerifySchema), authController.verify2FA);
router.post('/2fa/login',       validate(v.totpLoginSchema), authController.login2FA);

module.exports = router;
