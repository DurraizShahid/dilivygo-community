/**
 * Match apps/customer home: explicit refs env, else single project ref, else marketplace mode.
 *
 * Post-organization-as-marketplace migration the single ref is typically an
 * **organization** `public_ref` (the org is the marketplace). It may also be a
 * workspace `project_ref` (legacy / dev builds). The `_marketplace` sentinel is a
 * legacy fallback that resolves server-side to the synthetic marketplace org.
 */
export function parseCommaSeparatedRefs(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean)
    .filter((ref, idx, arr) => arr.indexOf(ref) === idx);
}

const RESTAURANT_REFS_ENV = process.env.EXPO_PUBLIC_RESTAURANT_REFS?.trim();
const PROJECT_REF_ENV = process.env.EXPO_PUBLIC_PROJECT_REF?.trim();

/**
 * Community Edition gating: multi-vendor aggregation (comma-separated
 * `EXPO_PUBLIC_RESTAURANT_REFS`) is commercial Marketplace-suite behavior.
 * When the edition is `community` (the default), the customer app is scoped
 * to the single configured shop (`EXPO_PUBLIC_PROJECT_REF`) and the
 * multi-ref env is ignored. Set `EXPO_PUBLIC_DILIVYGO_EDITION` to a
 * non-community value (e.g. `marketplace`) to re-enable multi-ref
 * aggregation in commercial builds.
 */
const EDITION = (process.env.EXPO_PUBLIC_DILIVYGO_EDITION || 'community')
  .trim()
  .toLowerCase();

function resolvePublicShopRefs(): string[] {
  const single = PROJECT_REF_ENV ? [PROJECT_REF_ENV] : ['_marketplace'];
  if (EDITION === 'community') return single;
  return RESTAURANT_REFS_ENV ? parseCommaSeparatedRefs(RESTAURANT_REFS_ENV) : single;
}

export const PUBLIC_SHOP_REFS = resolvePublicShopRefs();
