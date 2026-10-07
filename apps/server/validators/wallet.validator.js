'use strict';

const { z } = require('zod');

const walletTopupSchema = z.object({
  amountCents: z.number().int().min(50),
  currency: z
    .string()
    .length(3)
    .regex(/^[a-zA-Z]{3}$/)
    .transform((s) => s.toLowerCase())
    .optional(),
});

const superadminWalletCreditSchema = z.object({
  amountCents: z.number().int().positive(),
  note: z.string().max(500).optional(),
});

const superadminWalletDebitSchema = z.object({
  amountCents: z.number().int().positive(),
  note: z.string().max(500).optional(),
});

module.exports = {
  walletTopupSchema,
  superadminWalletCreditSchema,
  superadminWalletDebitSchema,
};
