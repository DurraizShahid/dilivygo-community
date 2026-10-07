import { z } from "zod";

export function normalizePhoneToE164(input: string) {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  const withPlus = trimmed.startsWith("00") ? `+${trimmed.slice(2)}` : trimmed;
  const digitsAndPlusOnly = withPlus.replace(/[^\d+]/g, "");
  if (digitsAndPlusOnly.includes("+")) {
    return `+${digitsAndPlusOnly.replace(/\+/g, "")}`;
  }
  return digitsAndPlusOnly;
}

export function isE164(phone: string) {
  return /^\+[1-9]\d{6,14}$/.test(phone);
}

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const otpContactSchema = z
  .object({
    channel: z.enum(["phone", "email"]),
    phone: z.string().default(""),
    email: z.string().default(""),
    phoneLinkEmail: z.string().default(""),
    /**
     * When true AND the server reports `demoMode`, the contact form submits
     * directly to `/api/auth/customer/demo-login` instead of `/api/auth/otp/send`.
     * The server hard-gates demo-login on `platform_settings.demo_mode`, so a
     * tampered client can never bypass OTP on a real deployment.
     */
    skipOtp: z.boolean().default(false),
  })
  .superRefine((val, ctx) => {
    if (val.channel === "phone") {
      const normalized = normalizePhoneToE164(val.phone);
      if (!isE164(normalized)) {
        ctx.addIssue({
          code: "custom",
          path: ["phone"],
          message: "Enter your phone in international format, e.g. +447700900000",
        });
      }
    } else {
      const normalizedEmail = val.email.trim().toLowerCase();
      if (!emailRegex.test(normalizedEmail)) {
        ctx.addIssue({
          code: "custom",
          path: ["email"],
          message: "Enter a valid email address.",
        });
      }
    }
    const linkEmail = val.phoneLinkEmail.trim().toLowerCase();
    if (linkEmail && !emailRegex.test(linkEmail)) {
      ctx.addIssue({
        code: "custom",
        path: ["phoneLinkEmail"],
        message: "Enter a valid email address.",
      });
    }
  });

export type OtpContactInput = z.infer<typeof otpContactSchema>;

export const otpVerifySchema = z.object({
  code: z
    .string()
    .regex(/^\d{6}$/u, "Enter the 6-digit verification code."),
});

export type OtpVerifyInput = z.infer<typeof otpVerifySchema>;

export const recoveryContactSchema = z
  .object({
    recoveryEmail: z.string(),
    recoveryNewPhone: z.string(),
  })
  .superRefine((val, ctx) => {
    const email = val.recoveryEmail.trim().toLowerCase();
    if (!emailRegex.test(email)) {
      ctx.addIssue({
        code: "custom",
        path: ["recoveryEmail"],
        message: "Enter a valid email address.",
      });
    }
    const normalized = normalizePhoneToE164(val.recoveryNewPhone);
    if (!isE164(normalized)) {
      ctx.addIssue({
        code: "custom",
        path: ["recoveryNewPhone"],
        message: "Enter your new phone in international format, e.g. +447700900000",
      });
    }
  });

export type RecoveryContactInput = z.infer<typeof recoveryContactSchema>;

export const recoveryVerifySchema = z.object({
  recoveryCode: z
    .string()
    .regex(/^\d{6}$/u, "Enter the 6-digit recovery code."),
});

export type RecoveryVerifyInput = z.infer<typeof recoveryVerifySchema>;

export const customerProfileSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email({ message: "Enter a valid email address" }),
});

export type CustomerProfileInput = z.infer<typeof customerProfileSchema>;
