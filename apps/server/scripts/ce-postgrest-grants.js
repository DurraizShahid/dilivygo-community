'use strict';

/**
 * Community Edition: grant PostgREST roles access after migrations.
 *
 * The CE docker-compose runs standalone PostgREST (not the full Supabase
 * stack). The server talks to it with the service_role JWT, so that role
 * needs full access to every table/sequence the migrations create.
 *
 * Usage (after `npm run migrate:local`):
 *   node docker/ce-postgrest-grants.js
 *
 * Connection: SUPABASE_DB_URL (same as migrations/runner.local.js).
 */

const { Client } = require('pg');

const DB_URL =
  process.env.SUPABASE_DB_URL ||
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const GRANTS = `
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE dilivygo IN SCHEMA public
  GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE dilivygo IN SCHEMA public
  GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON SEQUENCES TO service_role;
`;

async function run() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  try {
    await client.query(GRANTS);
    console.log('PostgREST grants applied.');
  } finally {
    await client.end();
  }
}

run().catch((err) => {
  console.error('Grant failed:', err.message);
  process.exit(1);
});
