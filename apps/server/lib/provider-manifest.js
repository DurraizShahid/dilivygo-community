'use strict';

/**
 * Provider manifest validator (Phase 14).
 *
 * Validates declarative provider metadata against
 * `integrations/provider-manifest-schema.json` with a HAND-ROLLED validator
 * (no new dependencies — `ajv` deliberately not added). The schema file is
 * the single source of truth: value sets (category/type/priority/auth.type),
 * required fields, and the allowed property list are all read from it, so
 * editing the schema automatically moves the validator.
 *
 * Also enforces the conditional rule documented in the schema: entries with
 * `type: 'nango'` MUST carry a non-empty `integrationId` (the Nango Unique
 * Key); other types must not rely on one.
 *
 * NOT mounted anywhere — used by tests and (later) by catalog CI checks.
 */

const fs = require('fs');
const path = require('path');

const SCHEMA_PATH = path.join(__dirname, '..', '..', '..', 'integrations', 'provider-manifest-schema.json');

let cachedSchema = null;

function loadManifestSchema() {
  if (cachedSchema) return cachedSchema;
  const raw = fs.readFileSync(SCHEMA_PATH, 'utf8');
  cachedSchema = JSON.parse(raw);
  return cachedSchema;
}

/** Test hook: drop the cache so schema edits are picked up without restart. */
function clearManifestSchemaCache() {
  cachedSchema = null;
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function checkPrimitive(prop, value, definition, basePath, errors) {
  const at = basePath ? `${basePath}.${prop}` : prop;
  if (definition.type === 'string') {
    if (typeof value !== 'string') {
      errors.push(`${at}: expected string, got ${Array.isArray(value) ? 'array' : typeof value}`);
      return;
    }
    if (typeof definition.minLength === 'number' && value.length < definition.minLength) {
      errors.push(`${at}: must not be empty`);
    }
    if (definition.pattern && !(new RegExp(definition.pattern).test(value))) {
      errors.push(`${at}: does not match pattern ${definition.pattern}`);
    }
    if (Array.isArray(definition.enum) && !definition.enum.includes(value)) {
      errors.push(`${at}: '${value}' is not one of [${definition.enum.join(', ')}]`);
    }
    return;
  }
  if (definition.type === 'boolean') {
    if (typeof value !== 'boolean') errors.push(`${at}: expected boolean`);
    return;
  }
  if (definition.type === 'array') {
    if (!Array.isArray(value)) {
      errors.push(`${at}: expected array`);
      return;
    }
    if (typeof definition.minItems === 'number' && value.length < definition.minItems) {
      errors.push(`${at}: requires at least ${definition.minItems} item(s)`);
    }
    const item = definition.items || {};
    value.forEach((entry, index) => {
      const itemPath = `${at}[${index}]`;
      if (item.type === 'string') {
        if (typeof entry !== 'string') {
          errors.push(`${itemPath}: expected string`);
        } else if (typeof item.minLength === 'number' && entry.length < item.minLength) {
          errors.push(`${itemPath}: must not be empty`);
        }
      }
    });
  }
}

/**
 * Validate one manifest entry. Returns `{ valid, errors }` — never throws
 * for invalid data (only for unreadable schema, which is a deploy bug).
 */
function validateProviderManifest(entry, schema) {
  const errors = [];
  const sch = schema || loadManifestSchema();

  if (!isPlainObject(entry)) {
    return { valid: false, errors: ['manifest: expected an object'] };
  }

  const allowed = new Set(Object.keys(sch.properties || {}));
  for (const key of Object.keys(entry)) {
    if (!allowed.has(key)) {
      errors.push(`${key}: unknown field (not in provider-manifest-schema.json properties)`);
    }
  }

  for (const field of sch.required || []) {
    if (entry[field] === undefined || entry[field] === null || entry[field] === '') {
      errors.push(`${field}: required`);
    }
  }

  for (const [prop, definition] of Object.entries(sch.properties || {})) {
    const value = entry[prop];
    if (value === undefined) continue;
    if (definition.type === 'object') {
      if (!isPlainObject(value)) {
        errors.push(`${prop}: expected object`);
        continue;
      }
      const subAllowed = new Set(Object.keys(definition.properties || {}));
      for (const key of Object.keys(value)) {
        if (!subAllowed.has(key)) errors.push(`${prop}.${key}: unknown field`);
      }
      for (const field of definition.required || []) {
        if (value[field] === undefined) errors.push(`${prop}.${field}: required`);
      }
      for (const [sub, subDef] of Object.entries(definition.properties || {})) {
        if (value[sub] !== undefined) checkPrimitive(sub, value[sub], subDef, prop, errors);
      }
      continue;
    }
    checkPrimitive(prop, value, definition, '', errors);
  }

  // Conditional rule from the schema notes: nango entries need an integration id.
  if (entry.type === 'nango') {
    if (typeof entry.integrationId !== 'string' || entry.integrationId.length === 0) {
      errors.push('integrationId: required when type is nango');
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate a whole catalog array (e.g. integrations/catalog.json).
 * Returns `{ valid, checked, errorCount, results: [{ key, valid, errors }] }`.
 */
function validateCatalog(entries, schema) {
  const sch = schema || loadManifestSchema();
  const list = Array.isArray(entries) ? entries : [];
  const results = list.map((entry, index) => {
    const { valid, errors } = validateProviderManifest(entry, sch);
    return { key: entry && entry.key ? String(entry.key) : `#${index}`, valid, errors };
  });
  const errorCount = results.reduce((n, r) => n + r.errors.length, 0);
  return { valid: errorCount === 0, checked: results.length, errorCount, results };
}

module.exports = {
  SCHEMA_PATH,
  loadManifestSchema,
  clearManifestSchemaCache,
  validateProviderManifest,
  validateCatalog,
};
