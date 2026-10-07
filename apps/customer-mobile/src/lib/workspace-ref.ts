/**
 * Public ref for theme + customer OTP scope.
 *
 * Post-organization-as-marketplace migration (see `.cursor/rules/dilivygo-standards.mdc`
 * → "Organization-as-marketplace") this ref can be:
 *   - an **organization** `public_ref` (each org is its own independent marketplace —
 *     the usual value for a deployed customer app), OR
 *   - a workspace `project_ref` (legacy / dev), OR
 *   - the `_marketplace` sentinel, which resolves server-side to the synthetic
 *     marketplace organization (legacy fallback).
 *
 * Prefer setting `EXPO_PUBLIC_PROJECT_REF` to an organization's `public_ref` in
 * production builds. Matches `apps/customer/src/lib/workspace-ref.ts`.
 */
export const MARKETPLACE_PUBLIC_REF = "_marketplace";

export function defaultWorkspaceRef(): string {
  const explicit = process.env.EXPO_PUBLIC_PROJECT_REF?.trim();
  if (explicit) return explicit;
  return MARKETPLACE_PUBLIC_REF;
}
