/** Two-letter ISO 3166-1 alpha-2 region → flag emoji (Unicode regional indicators). */
export function regionCodeToFlagEmoji(region: string): string {
  const code = region.toUpperCase().replace(/[^A-Z]/g, "");
  if (code.length !== 2) return "\u{1F3F3}\uFE0F";
  const base = 0x1f1e6;
  const a = code.charCodeAt(0) - 0x41;
  const b = code.charCodeAt(1) - 0x41;
  if (a < 0 || a > 25 || b < 0 || b > 25) return "\u{1F3F3}\uFE0F";
  return String.fromCodePoint(base + a, base + b);
}
