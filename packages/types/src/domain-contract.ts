/**
 * Domain Forwarding V2 — Target contract types (ADR-001)
 *
 * Small shared constants + types so ADR, routing-matrix.json, validators,
 * middleware, jobs, and tests can import one source of truth.
 *
 * Phase 01 may extend this without breaking current imports.
 */

export type AppSurface = "customer" | "rider" | "vendor" | "pos" | "saas" | "superadmin" | "apex";

export type TenantCustomizableSurface = "customer" | "rider" | "vendor" | "pos" | "apex";

export type DomainStatus =
  | "pending"
  | "dns_pending"
  | "verifying"
  | "active"
  | "error"
  | "removing"
  | "removed";

export type TlsReadiness = "pending" | "ready" | "error";

export type TenantScope = "organization" | "workspace" | "platform";

export interface DomainFamilyPreferred {
  customer: string;
  rider: string;
  vendor: string;
  pos: string;
}

export const DOMAIN_FAMILY_PREFERRED: DomainFamilyPreferred = {
  customer: "apex (example.com) or www or restaurant.example.com",
  rider: "rider.example.com",
  vendor: "vendor.example.com",
  pos: "pos.example.com",
} as const;

export type HostnameErrorCode =
  | "HOSTNAME_TOO_SHORT"
  | "HOSTNAME_TOO_LONG"
  | "HOSTNAME_TRAILING_DOT_REMOVED"
  | "HOSTNAME_PROTOCOL_FORBIDDEN"
  | "HOSTNAME_PATH_FORBIDDEN"
  | "HOSTNAME_QUERY_FORBIDDEN"
  | "HOSTNAME_FRAGMENT_FORBIDDEN"
  | "HOSTNAME_USERINFO_FORBIDDEN"
  | "HOSTNAME_PORT_IN_VALUE_FORBIDDEN"
  | "HOSTNAME_LABEL_FORBIDDEN"
  | "HOSTNAME_WILDCARD_FORBIDDEN"
  | "HOSTNAME_IP_FORBIDDEN"
  | "HOSTNAME_UNDERSCORE_FORBIDDEN"
  | "HOSTNAME_RESERVED"
  | "HOSTNAME_APEX_SHADOW_FORBIDDEN"
  | "HOSTNAME_APEX_SURFACE_ONLY_CUSTOMER"
  | "HOSTNAME_TAKEN"
  | "HOSTNAME_HOLD"
  | "PRIMARY_ALREADY_SET";

export interface CanonicalHostnameOptions {
  allowInternal?: boolean;
}

export const SURFACE_SCOPE: Record<AppSurface, TenantScope> = {
  customer: "organization",
  rider: "organization",
  vendor: "workspace",
  pos: "workspace",
  apex: "organization",
  saas: "platform",
  superadmin: "platform",
} as const;

export const TENANT_CUSTOMIZABLE: ReadonlySet<TenantCustomizableSurface> = new Set([
  "customer",
  "rider",
  "vendor",
  "pos",
  "apex",
]);

export const DOMAIN_LIFECYCLE_STATES: readonly DomainStatus[] = [
  "pending",
  "dns_pending",
  "verifying",
  "active",
  "error",
  "removing",
  "removed",
] as const;
