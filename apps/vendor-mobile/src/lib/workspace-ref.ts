/** Theme / public API ref when not pinned to one workspace (aligns with server marketplace). */
export const MARKETPLACE_PUBLIC_REF = "_marketplace";

export function defaultPublicThemeRef(): string {
  return process.env.EXPO_PUBLIC_PROJECT_REF?.trim() || MARKETPLACE_PUBLIC_REF;
}
