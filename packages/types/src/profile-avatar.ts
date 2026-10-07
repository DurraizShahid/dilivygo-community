/** FNV-1a 32-bit — stable for the same string across JS runtimes. */
export function hashStringToUint32(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function hasCustomProfilePhoto(avatarUrl: string | null | undefined): boolean {
  return typeof avatarUrl === "string" && avatarUrl.trim().length > 0;
}

/**
 * Picks a stable default image URL from the server-provided list (e.g. `/api/public/theme`).
 */
export function pickDefaultProfilePhotoUrl(
  stableKey: string,
  defaultPhotoUrls: readonly string[],
): string {
  const list = defaultPhotoUrls.filter((u) => typeof u === "string" && u.trim().length > 0);
  if (list.length === 0) return "";
  const k = stableKey.trim() || "anonymous";
  const idx = hashStringToUint32(k) % list.length;
  return list[idx] ?? list[0] ?? "";
}

export function resolveProfileAvatarUrl(
  avatarUrl: string | null | undefined,
  stableKey: string,
  defaultPhotoUrls: readonly string[],
): string {
  if (hasCustomProfilePhoto(avatarUrl)) return String(avatarUrl).trim();
  return pickDefaultProfilePhotoUrl(stableKey, defaultPhotoUrls);
}
