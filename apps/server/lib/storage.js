'use strict';

const { opaqueId } = require('./opaque-id');
const config = require('../config');
const logger = require('./logger');
const { createError } = require('../middleware/error.middleware');

const BASE_URL = config.supabase.url;
const SERVICE_KEY = config.supabase.serviceRoleKey || config.supabase.serviceKey;

/**
 * Detect whether the configured Supabase key is actually a server-side key
 * (bypasses RLS). Supabase's current key format is:
 *   • `sb_secret_*`        → server-only, bypasses RLS
 *   • `sb_publishable_*`   → client-safe, subject to RLS (NOT what we want)
 * The legacy JWT format carries the role in a `"role":"service_role"` claim
 * in the middle (base64-encoded) segment. Anything else is either anon or
 * malformed.
 *
 * Returns `{ ok: boolean, kind: string }`. When `ok: false`, callers should
 * refuse to perform privileged ops (bucket writes) and log a clear error so
 * operators don't chase phantom RLS failures in production.
 */
function classifyServiceKey(key) {
  if (!key || typeof key !== 'string') return { ok: false, kind: 'missing' };
  const trimmed = key.trim();
  if (!trimmed) return { ok: false, kind: 'missing' };

  if (trimmed.startsWith('sb_secret_')) return { ok: true, kind: 'sb_secret' };
  if (trimmed.startsWith('sb_publishable_')) return { ok: false, kind: 'sb_publishable' };

  // Legacy JWT: three dot-separated base64url segments. Peek at the payload
  // to see if it's a `service_role` token vs an `anon` token.
  const parts = trimmed.split('.');
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(
        Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
      );
      if (payload?.role === 'service_role') return { ok: true, kind: 'jwt_service_role' };
      if (payload?.role === 'anon') return { ok: false, kind: 'jwt_anon' };
      return { ok: false, kind: `jwt_${payload?.role || 'unknown'}` };
    } catch {
      return { ok: false, kind: 'jwt_unparseable' };
    }
  }

  return { ok: false, kind: 'unknown' };
}

const SERVICE_KEY_CLASSIFICATION = classifyServiceKey(SERVICE_KEY);
if (SERVICE_KEY && !SERVICE_KEY_CLASSIFICATION.ok) {
  // Don't throw — the process must still boot so non-storage routes keep
  // working — but log loudly so the operator sees this during deploy.
  logger.error(
    `Supabase key is not a service-role key (detected: ${SERVICE_KEY_CLASSIFICATION.kind}). ` +
    'Storage writes will fail with RLS policy violations. ' +
    'Set SUPABASE_SERVICE_ROLE_KEY to an `sb_secret_*` key (or a legacy `service_role` JWT) from ' +
    'Supabase Dashboard → Project Settings → API Keys.'
  );
}

const BUCKET = 'product-images';
/** Public bucket for default profile illustrations (theme URLs). */
const SAMPLE_PROFILE_PHOTOS_BUCKET = 'sample_profile_photos';

const DEFAULT_IMAGE_BUCKET_OPTIONS = {
  public: true,
  file_size_limit: 5 * 1024 * 1024,
  allowed_mime_types: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
};

const EXT_MAP = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

/**
 * Ensure a public image bucket exists (idempotent — 409 = already exists).
 * @param {string} bucketId
 * @param {object} [extra] — merged into POST body after id/name
 */
async function ensurePublicImageBucket(bucketId, extra = {}) {
  if (!BASE_URL || !SERVICE_KEY) {
    logger.debug(`Skip storage bucket "${bucketId}" — SUPABASE_URL or service key missing`);
    return;
  }
  try {
    const res = await fetch(`${BASE_URL}/storage/v1/bucket`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({
        id: bucketId,
        name: bucketId,
        ...DEFAULT_IMAGE_BUCKET_OPTIONS,
        ...extra,
      }),
    });

    if (res.ok) {
      logger.info(`Storage bucket "${bucketId}" created`);
    } else if (res.status === 409) {
      logger.debug(`Storage bucket "${bucketId}" already exists`);
    } else {
      const body = await res.text();
      logger.warn(`Could not create storage bucket "${bucketId}": ${res.status} ${body}`);
    }
  } catch (err) {
    logger.warn(`Storage bucket "${bucketId}" init failed: ${err.message}`);
  }
}

/** Product / platform uploads — called once at startup. */
function ensureBucket() {
  return ensurePublicImageBucket(BUCKET);
}

/** Default profile photo assets — called once at startup. */
function ensureSampleProfilePhotosBucket() {
  return ensurePublicImageBucket(SAMPLE_PROFILE_PHOTOS_BUCKET);
}

/**
 * Upload an image buffer to Supabase Storage.
 * @param {Buffer} buffer
 * @param {string} mimetype
 * @param {string} folder  - e.g. "products" or "shops"
 * @returns {Promise<string>} public URL of the uploaded image
 */
async function uploadImage(buffer, mimetype, folder = 'products') {
  const base = typeof BASE_URL === 'string' ? BASE_URL.trim().replace(/\/$/, '') : '';
  const serviceKey = typeof SERVICE_KEY === 'string' ? SERVICE_KEY.trim() : '';
  if (!base || !serviceKey) {
    throw createError(
      'Image storage is not configured on the API server. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY).',
      503
    );
  }

  const ext = EXT_MAP[mimetype] || '.img';
  const filename = `${folder}/${opaqueId()}${ext}`;

  const body =
    Buffer.isBuffer(buffer) ? new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength) : buffer;

  let res;
  try {
    res = await fetch(`${base}/storage/v1/object/${BUCKET}/${filename}`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': mimetype,
        'x-upsert': 'true',
      },
      body,
    });
  } catch (err) {
    logger.error('Supabase Storage upload fetch failed', { message: err.message });
    throw createError(
      'Could not reach image storage. Verify SUPABASE_URL and that the API server can reach Supabase.',
      502
    );
  }

  if (!res.ok) {
    const raw = await res.text();
    logger.error('Supabase Storage upload failed', {
      status: res.status,
      body: raw,
      folder,
      mimetype,
      sizeBytes: Buffer.isBuffer(buffer) ? buffer.byteLength : null,
    });
    if (res.status === 401 || res.status === 403) {
      throw createError(
        'Image storage rejected this upload (invalid or missing Supabase service role key).',
        502
      );
    }
    if (res.status === 404) {
      throw createError(
        'Image storage bucket is missing. Ensure the Supabase bucket "product-images" exists (the server creates it on startup when credentials are set).',
        502
      );
    }
    // Parse the Supabase error envelope (JSON: {statusCode, error, message})
    // so callers — and Sentry breadcrumbs — see the real reason instead of
    // just "Image upload failed: 400".
    let parsed = null;
    try { parsed = raw ? JSON.parse(raw) : null; } catch { /* plaintext body */ }
    const reason = parsed?.message || parsed?.error || raw || 'unknown';

    // RLS policy violation on INSERT into storage.objects is almost always
    // caused by running with the publishable/anon key instead of the service
    // role key. Give the operator a direct, actionable message instead of a
    // generic 502 so this doesn't repeat (see 2026-04-21 incident).
    const looksLikeRlsDenial =
      res.status === 400 &&
      /row-level security|row level security|rls/i.test(String(reason));
    if (looksLikeRlsDenial) {
      const keyHint = SERVICE_KEY_CLASSIFICATION.ok
        ? ''
        : ` Detected Supabase key type: ${SERVICE_KEY_CLASSIFICATION.kind}. Expected \`sb_secret_*\` or a legacy \`service_role\` JWT.`;
      const err = createError(
        'Image upload rejected by storage RLS. The server appears to be using an anon/publishable ' +
          'Supabase key instead of the service role key — fix SUPABASE_SERVICE_ROLE_KEY on the API host.' +
          keyHint,
        502
      );
      err.storageStatus = res.status;
      err.storageBody = raw;
      err.storageReason = String(reason).slice(0, 500);
      err.keyKind = SERVICE_KEY_CLASSIFICATION.kind;
      throw err;
    }

    const hint = !config.isProd && reason ? ` — ${String(reason).slice(0, 240)}` : '';
    const err = createError(
      `Image upload failed (storage returned ${res.status}: ${String(reason).slice(0, 120)}).${hint}`,
      502
    );
    err.storageStatus = res.status;
    err.storageBody = raw;
    err.storageReason = String(reason).slice(0, 500);
    throw err;
  }

  return `${base}/storage/v1/object/public/${BUCKET}/${filename}`;
}

/**
 * Delete an image from Supabase Storage by its public URL.
 * @param {string} publicUrl
 */
async function deleteImage(publicUrl) {
  if (!publicUrl) return;

  const prefix = `${BASE_URL}/storage/v1/object/public/${BUCKET}/`;
  if (!publicUrl.startsWith(prefix)) return;

  const objectPath = publicUrl.slice(prefix.length);

  try {
    const res = await fetch(`${BASE_URL}/storage/v1/object/${BUCKET}/${objectPath}`, {
      method: 'DELETE',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
    });
    if (!res.ok) {
      const body = await res.text();
      logger.warn(`Failed to delete image "${objectPath}": ${res.status} ${body}`);
    }
  } catch (err) {
    logger.warn(`Image deletion failed: ${err.message}`);
  }
}

module.exports = {
  ensureBucket,
  ensureSampleProfilePhotosBucket,
  uploadImage,
  deleteImage,
  BUCKET,
  SAMPLE_PROFILE_PHOTOS_BUCKET,
};
