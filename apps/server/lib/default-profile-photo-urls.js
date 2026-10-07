'use strict';

const config = require('../config');
const { SAMPLE_PROFILE_PHOTOS_BUCKET: BUCKET } = require('./storage');
const OBJECT_NAMES = [
  'sample image 1.png',
  'sample image 2.png',
  'sample image 3.png',
  'sample image 4.png',
  'sample image 5.png',
];

/**
 * Public storage URLs for default profile illustrations (Supabase Storage).
 * Built from `SUPABASE_URL` so each deployment points at the correct project.
 */
function getDefaultProfilePhotoUrls() {
  const base = String(config.supabase?.url || '').replace(/\/$/, '');
  if (!base) return [];
  const prefix = `${base}/storage/v1/object/public/${BUCKET}/`;
  return OBJECT_NAMES.map((name) => `${prefix}${encodeURIComponent(name)}`);
}

module.exports = { getDefaultProfilePhotoUrls, BUCKET, OBJECT_NAMES };
