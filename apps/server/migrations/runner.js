'use strict';

/**
 * Migration runner — executes numbered SQL files in order via Supabase Management API.
 * Tracks applied migrations in a `schema_migrations` table.
 *
 * Each migration and its marker are committed in ONE database transaction. If
 * either the migration SQL or bookkeeping fails, neither is retained.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });

const fs = require('fs');
const path = require('path');
const config = require('../config');
const logger = require('../lib/logger');

const MIGRATIONS_DIR = __dirname;
const PROJECT_REF = extractProjectRef(config.supabase.url);

function extractProjectRef(url) {
  if (!url) throw new Error('SUPABASE_URL is not set');
  const match = url.match(/https:\/\/([^.]+)\.supabase\.co/);
  if (!match) throw new Error(`Cannot extract project ref from SUPABASE_URL: ${url}`);
  return match[1];
}

async function managementFetch(path, options = {}) {
  const url = `https://api.supabase.com${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.supabase.accessToken}`,
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Management API ${res.status}: ${body}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function ensureMigrationsTable() {
  const sql = `
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     TEXT PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;
  await managementFetch(`/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    body: JSON.stringify({ query: sql }),
  });
}

async function getAppliedMigrations() {
  const result = await managementFetch(`/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    body: JSON.stringify({ query: 'SELECT version FROM schema_migrations ORDER BY version;' }),
  });
  return new Set((result || []).map((r) => r.version));
}

function sqlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function applyMigration(version, sql) {
  logger.info(`Applying migration: ${version}`);

  const transactionSql = `
BEGIN;
${sql}
INSERT INTO schema_migrations (version)
VALUES (${sqlLiteral(version)})
ON CONFLICT (version) DO NOTHING;
COMMIT;
`;

  await managementFetch(`/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    body: JSON.stringify({ query: transactionSql }),
  });

  logger.info(`Migration applied: ${version}`);
}

async function run() {
  logger.info('Running database migrations...');

  await ensureMigrationsTable();
  const applied = await getAppliedMigrations();

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let count = 0;
  for (const file of files) {
    const version = file.replace('.sql', '');
    if (applied.has(version)) {
      logger.debug(`Skipping already-applied migration: ${version}`);
      continue;
    }

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    await applyMigration(version, sql);
    count++;
  }

  if (count === 0) {
    logger.info('All migrations already applied — nothing to do.');
  } else {
    logger.info(`${count} migration(s) applied successfully.`);
  }
}

run().catch((err) => {
  logger.error('Migration runner failed', { error: err.message });
  process.exit(1);
});
