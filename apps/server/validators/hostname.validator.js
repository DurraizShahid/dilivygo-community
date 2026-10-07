'use strict';

const { z } = require('zod');
const { canonicalizeHostname } = require('../lib/hostname-canonical');

const hostnameField = z
  .string()
  .trim()
  .min(3)
  .max(253)
  .transform((value) => {
    // Single canonical implementation: lower+trim+punycode+regex (ADR-001 §2.8)
    // Return canonical on success; on failure return lowercased value so refine can produce a proper Zod issue
    // instead of throwing out of the transform pipeline.
    try {
      return canonicalizeHostname(value);
    } catch {
      // Preserve a best-effort normalized form for the refine checks below; the upcoming refine will reject.
      try {
        return String(value).trim().toLowerCase().replace(/\.$/, '');
      } catch {
        return value;
      }
    }
  })
  .refine(
    (value) => {
      try {
        canonicalizeHostname(value);
        return true;
      } catch {
        return false;
      }
    },
    { message: 'Enter a valid hostname such as vendor.example.com (no protocol, path, port, wildcard, or IP address)' },
  )
  .refine(
    (value) => {
      // Keep explicit IP message parity for clients that check this string
      if (/^\d+(?:\.\d+){3}$/.test(value)) return false;
      return true;
    },
    { message: 'IP addresses are not allowed as custom hostnames' },
  );

const addHostnameSchema = z.object({
  workspaceId: z.string().uuid(),
  hostname: hostnameField,
  appSurface: z.enum(['vendor', 'pos']),
});

const addOrgHostnameSchema = z.object({
  hostname: hostnameField,
  appSurface: z.enum(['customer', 'rider']),
});

const domainIdParamSchema = z.object({
  id: z.string().uuid(),
});

module.exports = { hostnameField, addHostnameSchema, addOrgHostnameSchema, domainIdParamSchema };
