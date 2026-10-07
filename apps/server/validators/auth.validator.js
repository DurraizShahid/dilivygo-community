'use strict';

const { z } = require('zod');

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['admin', 'vendor', 'rider']),
  projectRef: z.string().min(1),
  name: z.string().max(200).optional().nullable(),
  firstName: z.string().max(100).optional().nullable(),
  lastName: z.string().max(100).optional().nullable(),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
});

const otpChannelSchema = z.enum(['phone', 'email']);

function validateOtpIdentity(data, ctx) {
  const hasPhone = Boolean(data.phone);
  const hasEmail = Boolean(data.email);
  const channel = data.channel || (hasPhone && !hasEmail ? 'phone' : !hasPhone && hasEmail ? 'email' : null);

  if (!channel) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Provide exactly one of phone or email',
      path: ['channel'],
    });
    return;
  }

  if (channel === 'phone') {
    if (!hasPhone) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Phone is required for phone OTP',
        path: ['phone'],
      });
    }
    if (hasEmail) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Email is not allowed for phone OTP',
        path: ['email'],
      });
    }
    return;
  }

  if (!hasEmail) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Email is required for email OTP',
      path: ['email'],
    });
  }
  if (hasPhone) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Phone is not allowed for email OTP',
      path: ['phone'],
    });
  }
}

/** Phone OTP verify may include an optional `email` to link for future email sign-in. */
function validateOtpVerifyIdentity(data, ctx) {
  const explicitChannel = data.channel;
  const hasPhone = Boolean(data.phone);
  const trimmedEmail = typeof data.email === 'string' ? data.email.trim() : '';
  const hasEmailValue = trimmedEmail.length > 0;

  const inferredChannel =
    explicitChannel ||
    (hasPhone && !hasEmailValue ? 'phone' : !hasPhone && hasEmailValue ? 'email' : hasPhone ? 'phone' : null);

  if (!inferredChannel) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Provide phone or email (and channel when using both phone and optional email)',
      path: ['channel'],
    });
    return;
  }

  if (explicitChannel === 'email') {
    if (!hasEmailValue) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Email is required for email OTP',
        path: ['email'],
      });
    }
    if (hasPhone) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Phone is not allowed for email OTP',
        path: ['phone'],
      });
    }
    return;
  }

  if (inferredChannel === 'phone' || explicitChannel === 'phone') {
    if (!hasPhone) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Phone is required for phone OTP',
        path: ['phone'],
      });
    }
    return;
  }

  if (!hasEmailValue) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Email is required for email OTP',
      path: ['email'],
    });
  }
  if (hasPhone) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Phone is not allowed for email OTP',
      path: ['phone'],
    });
  }
}

const optionalProjectRef = z.preprocess(
  (v) => (v === '' || v == null ? undefined : v),
  z.string().min(1).max(128).optional()
);

/**
 * Strip non-digits, map fullwidth digits (common when pasting from email on mobile),
 * and accept numeric JSON bodies.
 */
function preprocessOtpCode(v) {
  if (v == null) return '';
  let s =
    typeof v === 'number' && Number.isFinite(v)
      ? String(Math.trunc(Math.abs(v)))
      : String(v);
  s = s.replace(/[\uFF10-\uFF19]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 0x30)
  );
  return s.replace(/\D/g, '');
}

const otpSendSchema = z
  .object({
    channel: otpChannelSchema.optional(),
    phone: z
      .string()
      .regex(/^\+[1-9]\d{6,14}$/, 'Phone must be in E.164 format, e.g. +447700900000')
      .optional(),
    email: z.string().email('Email must be valid').optional(),
    projectRef: optionalProjectRef,
  })
  .superRefine(validateOtpIdentity);

const otpVerifySchema = z
  .object({
    channel: otpChannelSchema.optional(),
    phone: z.string().regex(/^\+[1-9]\d{6,14}$/).optional(),
    email: z.preprocess(
      (v) => (v === '' || v == null ? undefined : v),
      z.string().email('Email must be valid').optional()
    ),
    code: z.preprocess(preprocessOtpCode, z.string().length(6, 'OTP must be 6 digits')),
    projectRef: optionalProjectRef,
    name: z.string().optional(),
  })
  .superRefine(validateOtpVerifyIdentity);

const customerDemoLoginSchema = z
  .object({
    channel: otpChannelSchema.optional(),
    phone: z
      .string()
      .regex(/^\+[1-9]\d{6,14}$/, 'Phone must be in E.164 format, e.g. +447700900000')
      .optional(),
    email: z.preprocess(
      (v) => (v === '' || v == null ? undefined : v),
      z.string().email('Email must be valid').optional()
    ),
    name: z.preprocess(
      (v) => (v === '' || v == null ? undefined : v),
      z.string().min(1).max(100).optional()
    ),
    projectRef: optionalProjectRef,
  })
  .superRefine(validateOtpIdentity);

const customerRecoverySendSchema = z.object({
  projectRef: optionalProjectRef,
  email: z.string().email('Email must be valid'),
});

const customerRecoveryVerifySchema = z.object({
  projectRef: optionalProjectRef,
  email: z.string().email('Email must be valid'),
  code: z.preprocess(preprocessOtpCode, z.string().length(6, 'OTP must be 6 digits')),
  newPhone: z.string().regex(/^\+[1-9]\d{6,14}$/, 'Phone must be in E.164 format, e.g. +447700900000'),
});

const customerProfileUpdateSchema = z
  .object({
    name: z.string().min(1, 'Name cannot be empty').max(100).optional(),
    email: z.string().email('Email must be valid').optional(),
  })
  .refine((data) => data.name !== undefined || data.email !== undefined, {
    message: 'Provide at least one field to update',
  });

const totpSetupSchema = z.object({
  password: z.string().min(1, 'Password required to set up 2FA'),
});

const totpVerifySchema = z.object({
  token: z.string().length(6, 'TOTP token must be 6 digits'),
});

const totpLoginSchema = z.object({
  sessionToken: z.string().min(1),
  totpToken: z.string().length(6),
});

module.exports = {
  loginSchema,
  signupSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  otpSendSchema,
  otpVerifySchema,
  customerDemoLoginSchema,
  customerRecoverySendSchema,
  customerRecoveryVerifySchema,
  customerProfileUpdateSchema,
  totpSetupSchema,
  totpVerifySchema,
  totpLoginSchema,
};
