/** Normalizes Next.js / bundler SVG default imports to a URL string. */
export function svgImportUrl(imported: string | { src: string }): string {
  if (typeof imported === "string") return imported;
  if (imported && typeof imported === "object" && "src" in imported) return imported.src;
  return "";
}
