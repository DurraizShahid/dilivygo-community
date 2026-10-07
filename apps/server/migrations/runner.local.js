'use strict';

/**
 * Local migration runner — applies numbered SQL files directly to a local
 * Postgres instance via node-postgres (pg).
 *
 * Used when SUPABASE_URL points at a local Supabase stack
 * (e.g. http://127.0.0.1:54321) where the Management API is unavailable.
 *
 * Tracks applied migrations in the same `schema_migrations` table using the
 * same transactional semantics as the Management-API runner.
 *
 * Connection:
 *   SUPABASE_DB_URL   full postgres connection string
 *                     (default: postgresql://postgres:postgres@127.0.0.1:54322/postgres)
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const logger = require('../lib/logger');

const MIGRATIONS_DIR = __dirname;
const DB_URL = process.env.SUPABASE_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

function sqlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function applyMigration(client, version, sql) {
  logger.info(`Applying migration: ${version}`);

  const transactionSql = `
BEGIN;
${sql}
INSERT INTO schema_migrations (version)
VALUES (${sqlLiteral(version)})
ON CONFLICT (version) DO NOTHING;
COMMIT;
`;

  await client.query(transactionSql);
  logger.info(`Migration applied: ${version}`);
}

async function run() {
  logger.info('Running database migrations (local runner)...');
  logger.info(`Target: ${DB_URL.replace(/:[^:@]+@/, ':****@')}`);

  const client = new Client({ connectionString: DB_URL });
  await client.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version     TEXT PRIMARY KEY,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const { rows } = await client.query('SELECT version FROM schema_migrations ORDER BY version;');
    const applied = new Set(rows.map((r) => r.version));

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

      // Skip the demo seed when the consumer handles seeding separately,
      // to keep this runner reusable for plain schema-only setups.
      try {
        await applyMigration(client, version, sql);
        count++;
      } catch (err) {
        logger.error(`Migration failed: ${version}`, { error: err.message });
        process.exitCode = 1;
        break;
      }
    }

    if (count === 0) {
      logger.info('All migrations already applied — nothing to do.');
    } else {
      logger.info(`${count} migration(s) applied successfully.`);
    }
  } finally {
    await client.end();
  }
}

run().catch((err) => {
  logger.error('Migration runner failed', { error: err.message });
  process.exit(1);
});