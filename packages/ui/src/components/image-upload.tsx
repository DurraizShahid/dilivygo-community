"use client";

import { useCallback, useRef, useState } from "react";
import { cn } from "../lib/utils";
import { Button } from "./button";
import { Input } from "./input";
import {
  ACCEPTED_IMAGE_INPUT_ATTR,
  DEFAULT_IMAGE_MAX_BYTES,
  validateImageFile,
} from "../lib/validate-image";

interface ImageUploadProps {
  value?: string | null;
  onChange: (url: string | null) => void;
  onUpload: (file: File) => Promise<{ url: string }>;
  disabled?: boolean;
  className?: string;
  /** Max file size in bytes (default 5MB) */
  maxSize?: number;
  /** Shorter drop zone and preview (e.g. stacked carousel slides) */
  compact?: boolean;
  /** Show a field to set the image from an https URL (no server upload). */
  allowUrlInput?: boolean;
}

const ACCEPT = ACCEPTED_IMAGE_INPUT_ATTR;

/** Avoid <img src> to JSON API URLs (e.g. mistaken paste of /api/.../shops/:id). */
function isDisplayableImageUrl(url: string): boolean {
  const t = url.trim();
  if (!t) return false;
  const lower = t.toLowerCase();
  if (lower.startsWith("data:image/") || lower.startsWith("blob:")) return true;
  try {
    const u =
      lower.startsWith("http://") || lower.startsWith("https://")
        ? new URL(t)
        : new URL(t, "http://local.invalid");
    if (u.pathname.toLowerCase().includes("/api/")) return false;
    return true;
  } catch {
    return false;
  }
}

type RemoteImageUrlValidation = { ok: true; url: string } | { ok: false; message: string };

/**
 * Type predicate for the failure branch of `validateRemoteImageUrl`.
 *
 * `packages/ui` is type-checked through consuming apps that compile with
 * `strict: false`, which disables narrowing on a plain `if (!value.ok)`
 * discriminant check. The predicate keeps the check working there.
 */
function isInvalidUrl(
  result: RemoteImageUrlValidation,
): result is Extract<RemoteImageUrlValidation, { ok: false }> {
  return !result.ok;
}

function validateRemoteImageUrl(raw: string): RemoteImageUrlValidation {
  const t = raw.trim();
  if (!t) return { ok: false, message: "Enter an image URL" };
  const lower = t.toLowerCase();
  if (lower.startsWith("javascript:") || lower.startsWith("vbscript:") || lower.startsWith("data:")) {
    return { ok: false, message: "Only http(s) image links are allowed" };
  }
  if (!lower.startsWith("http://") && !lower.startsWith("https://")) {
    return { ok: false, message: "URL must start with https:// or http://" };
  }
  try {
    const u = new URL(t);
    if (u.pathname.toLowerCase().includes("/api/")) {
      return { ok: false, message: "Use a direct image file URL, not an API link" };
    }
    return { ok: true, url: t };
  } catch {
    return { ok: false, message: "Invalid URL" };
  }
}

export function ImageUpload({
  value,
  onChange,
  onUpload,
  disabled = false,
  className,
  maxSize = DEFAULT_IMAGE_MAX_BYTES,
  compact = false,
  allowUrlInput = false,
}: ImageUploadProps) {
  const boxH = compact ? "h-32" : "h-48";
  const minHWhenNoPreview = compact ? "min-h-32" : "min-h-48";
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [urlField, setUrlField] = useState("");

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);

      const validation = validateImageFile(file, { maxBytes: maxSize });
      if (!validation.ok) {
        setError(validation.message);
        return;
      }

      setUploading(true);
      try {
        const result = await onUpload(file);
        onChange(result.url);
      } catch (err: unknown) {
        const message =
          err && typeof err === "object" && "message" in err
            ? String((err as { message?: unknown }).message)
            : "Upload failed";
        setError(message);
      } finally {
        setUploading(false);
      }
    },
    [maxSize, onChange, onUpload]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      if (inputRef.current) inputRef.current.value = "";
    },
    [handleFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (disabled || uploading) return;
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [disabled, uploading, handleFile]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!disabled && !uploading) setDragOver(true);
    },
    [disabled, uploading]
  );

  const handleDragLeave = useCallback(() => setDragOver(false), []);

  const handleRemove = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onChange(null);
      setError(null);
    },
    [onChange]
  );

  const applyImageUrl = useCallback(() => {
    const parsed = validateRemoteImageUrl(urlField);
    if (isInvalidUrl(parsed)) {
      setError(parsed.message);
      return;
    }
    setError(null);
    onChange(parsed.url);
    setUrlField("");
  }, [onChange, urlField]);

  return (
    <div className={cn("space-y-2", className)}>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={handleInputChange}
        disabled={disabled || uploading}
      />

      {value ? (
        <div className="group relative overflow-hidden rounded-xl border border-border bg-muted">
          {isDisplayableImageUrl(value) ? (
            <img src={value} alt="" className={cn("w-full object-cover", boxH)} />
          ) : (
            <div className={cn("flex flex-col justify-center gap-2 p-4", minHWhenNoPreview)}>
              <p className="text-sm text-muted-foreground">
                Preview unavailable — use a direct image URL (https://…) or upload a file. API links cannot be shown as images.
              </p>
              <p className="break-all font-mono text-xs text-muted-foreground">{value}</p>
            </div>
          )}
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={disabled || uploading}
              className="rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-gray-900 shadow-sm transition-colors hover:bg-gray-100"
            >
              Replace
            </button>
            <button
              type="button"
              onClick={handleRemove}
              disabled={disabled || uploading}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-red-700"
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          onClick={() => !disabled && !uploading && inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              if (!disabled && !uploading) inputRef.current?.click();
            }
          }}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed transition-colors",
            boxH,
            dragOver
              ? "border-primary bg-primary/5"
              : "border-border bg-muted/30 hover:border-primary/50 hover:bg-muted/50",
            (disabled || uploading) && "pointer-events-none opacity-60"
          )}
        >
          {uploading ? (
            <>
              <div className="size-8 animate-spin rounded-full border-2 border-muted-foreground border-t-primary" />
              <p className="text-sm text-muted-foreground">Uploading...</p>
            </>
          ) : (
            <>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-muted-foreground"
              >
                <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                <circle cx="9" cy="9" r="2" />
                <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
              </svg>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">
                  Click or drag to upload
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  PNG, JPEG, WebP or GIF up to {Math.round(maxSize / 1024 / 1024)} MB
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {allowUrlInput ? (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Image from URL</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              type="url"
              inputMode="url"
              autoComplete="off"
              placeholder="https://example.com/image.jpg"
              value={urlField}
              disabled={disabled || uploading}
              onChange={(e) => setUrlField(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  applyImageUrl();
                }
              }}
              className="sm:flex-1"
            />
            <Button
              type="button"
              variant="outline"
              disabled={disabled || uploading}
              onClick={applyImageUrl}
              className="shrink-0 sm:w-auto"
            >
              Use URL
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Paste a direct link to an image file. It is stored as-is (not uploaded to Dilivygo).
          </p>
        </div>
      ) : null}
    </div>
  );
}
