/**
 * Shared client-side image file validation used by both the ImageUpload
 * component and naked <input type="file"> callsites (logo/banner uploads,
 * browse category icons, etc.).
 *
 * The backend performs its own strict validation — this helper exists to
 * surface a friendly error *before* a wasted round-trip, and so all callsites
 * agree on the same accepted MIME types / size cap.
 */

export const ACCEPTED_IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

export const ACCEPTED_IMAGE_INPUT_ATTR = ACCEPTED_IMAGE_MIME_TYPES.join(",");

export const DEFAULT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export interface ValidateImageFileOptions {
  /** Max allowed size in bytes. Defaults to 5 MiB. */
  maxBytes?: number;
  /** Override the accepted MIME list. Defaults to PNG/JPEG/WebP/GIF. */
  acceptedTypes?: readonly string[];
}

export type ValidateImageFileResult = any;

export function validateImageFile(
  file: File | null | undefined,
  options: ValidateImageFileOptions = {},
): ValidateImageFileResult {
  if (!file) {
    return { ok: false, message: "No file selected" };
  }

  const maxBytes = options.maxBytes ?? DEFAULT_IMAGE_MAX_BYTES;
  const accepted = options.acceptedTypes ?? ACCEPTED_IMAGE_MIME_TYPES;

  // Browsers occasionally send application/octet-stream for dragged images on
  // Windows, so we do a belt-and-braces check: accept if MIME matches OR if
  // the file extension is in the allow-list. Keeps us permissive without
  // opening the door to executables.
  const typeMatches =
    file.type && accepted.some((t) => file.type.toLowerCase() === t);
  const name = file.name?.toLowerCase() ?? "";
  const extensionMatches =
    name.endsWith(".png") ||
    name.endsWith(".jpg") ||
    name.endsWith(".jpeg") ||
    name.endsWith(".webp") ||
    name.endsWith(".gif");

  if (!typeMatches && !extensionMatches) {
    return {
      ok: false,
      message: "Unsupported format. Use PNG, JPEG, WebP, or GIF.",
    };
  }

  if (file.size > maxBytes) {
    const mb = Math.round(maxBytes / 1024 / 1024);
    return {
      ok: false,
      message: `Image must be ${mb} MB or smaller`,
    };
  }

  if (file.size === 0) {
    return { ok: false, message: "That file is empty" };
  }

  return { ok: true, file };
}
