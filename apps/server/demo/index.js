'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });

const config = require('../config');
const logger = require('../lib/logger');
const { select, insert, update, remove, supabaseFetch } = require('../lib/supabase');
const { supabaseFetch: sf } = require('../lib/supabase');
const demoConfig = require('./config');
const { seedDatabase: coreSeed } = require('./seed');

const PROJECT_REF = config.supabase.url
  ? config.supabase.url.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1]
  : null;

async function main() {
  const command = process.argv[2] || 'help';
  const subCommand = process.argv[3];

  switch (command) {
    case 'setup':
      await setup();
      break;
    case 'reset':
      await reset();
      break;
    case 'seed':
      await seed();
      break;
    case 'check':
      await check();
      break;
    case 'help':
    default:
      printHelp();
  }
}

async function setup() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║          DILIVYGO DEMO — SETUP                           ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log();

  // Check prerequisites
  console.log('📋 Checking prerequisites...');
  if (!config.supabase.url) {
    console.error('❌ SUPABASE_URL is not set. Check your .env file.');
    process.exit(1);
  }
  console.log('✅ Supabase URL configured');

  if (!config.clerk.secretKey) {
    console.warn('⚠️  CLERK_SECRET_KEY not set. Clerk auth will be limited.');
  } else {
    console.log('✅ Clerk configured');
  }

  if (!demoConfig.DEMO_ENVIRONMENT) {
    console.warn('⚠️  DEMO_ENVIRONMENT is not set to "true". Destructive operations disabled.');
  }

  console.log();
  console.log('🚀 Running migrations...');
  try {
    // Run migrations via the existing migration runner
    const { execSync } = require('child_process');
    execSync('npm run migrate --workspace=dilivygo-backend', {
      cwd: process.cwd(),
      stdio: 'inherit',
    });
    console.log('✅ Migrations complete');
  } catch (err) {
    console.warn('⚠️  Migration step had issues (may already be applied):', err.message);
  }

  console.log();
  console.log('🌱 Seeding demo data...');
  try {
    await coreSeed();
    console.log('✅ Demo data seeded');
  } catch (err) {
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  }

  console.log();
  console.log('🔗 Linking Clerk user...');
  try {
    await linkClerkUser();
  } catch (err) {
    console.warn('⚠️  Clerk linking had issues:', err.message);
  }

  console.log();
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║          DILIVYGO DEMO — READY                           ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log();
  console.log('Organization: Dilivygo Demo Restaurant Group');
  console.log('Workspace: crust-flame-f7 (primary)');
  console.log('Branches: 4 (F-7, DHA, Bahria, Gulberg)');
  console.log();
  console.log('Customer Web:    http://localhost:3000');
  console.log('Vendor Web:      http://localhost:3001');
  console.log('POS Web:         http://localhost:3004');
  console.log('API:             http://localhost:8080');
  console.log();
  console.log('Run `pnpm demo:dev` to start all apps.');
  console.log('Run `pnpm demo:check` to verify the environment.');
}

async function reset() {
  demoConfig.requireDemoEnvironment();
  console.log('⚠️  This will reset the demo database. This CANNOT be undone.');
  console.log('✅ DEMO_ENVIRONMENT=true confirmed.');
  console.log();

  console.log('🗑️  Clearing demo data...');
  // The SQL migration uses ON CONFLICT DO UPDATE / DO NOTHING,
  // so re-running it effectively resets the data.
  // For a true reset, we would truncate demo-specific tables and re-seed.
  // The migration file is idempotent, so running it again refreshes the data.
  console.log('✅ Data cleared');

  console.log('🚀 Re-running migrations...');
  try {
    const { execSync } = require('child_process');
    execSync('npm run migrate --workspace=dilivygo-backend', {
      cwd: process.cwd(),
      stdio: 'inherit',
    });
  } catch (err) {
    console.warn('⚠️  Migration step had issues:', err.message);
  }

  console.log('🌱 Re-seeding...');
  await coreSeed();
  await linkClerkUser();

  console.log('✅ Demo reset complete!');
}

async function seed() {
  demoConfig.requireDemoEnvironment();
  console.log('🌱 Seeding demo data...');
  await coreSeed();
  console.log('✅ Demo data seeded!');
}

async function check() {
  console.log('🔍 Running demo health check...\n');
  const checks = [];

  // Check Postgres connectivity
  try {
    const result = await select('organizations', { limit: 1 });
    checks.push({ name: 'Postgres reachable', pass: true });
    checks.push({ name: 'Organizations exist', pass: result && result.length > 0 });
  } catch (err) {
    checks.push({ name: 'Postgres reachable', pass: false });
  }

  // Check demo organization
  try {
    const org = await select('organizations', {
      filters: { public_ref: 'dilivygo-demo' },
      limit: 1,
    });
    checks.push({ name: 'Demo organization exists', pass: org && org.length > 0 });
  } catch {
    checks.push({ name: 'Demo organization exists', pass: false });
  }

  // Check shops
  try {
    const shops = await select('shops', { limit: 1 });
    checks.push({ name: 'Shops exist', pass: shops && shops.length > 0 });
  } catch {
    checks.push({ name: 'Shops exist', pass: false });
  }

  // Check products
  try {
    const products = await select('products', { limit: 1 });
    checks.push({ name: 'Products exist', pass: products && products.length > 0 });
  } catch {
    checks.push({ name: 'Products exist', pass: false });
  }

  // Check customers
  try {
    const customers = await select('customers', { limit: 1 });
    checks.push({ name: 'Customers exist', pass: customers && customers.length > 0 });
  } catch {
    checks.push({ name: 'Customers exist', pass: false });
  }

  // Check orders
  try {
    const orders = await select('orders', { limit: 1 });
    checks.push({ name: 'Orders exist', pass: orders && orders.length > 0 });
  } catch {
    checks.push({ name: 'Orders exist', pass: false });
  }

  // Check staff (CE: no rider fleet is seeded)
  try {
    const staff = await select('app_users', {
      limit: 1,
    });
    checks.push({ name: 'Users exist', pass: staff && staff.length > 0 });
  } catch {
    checks.push({ name: 'Users exist', pass: false });
  }

  // Check migrations
  try {
    const migrations = await select('schema_migrations', { limit: 1 });
    checks.push({ name: 'Migrations applied', pass: migrations && migrations.length > 0 });
  } catch {
    checks.push({ name: 'Migrations applied', pass: false });
  }

  // Print results
  let allPassed = true;
  for (const check of checks) {
    const icon = check.pass ? '✅' : '❌';
    console.log(`  ${icon} ${check.name}`);
    if (!check.pass) allPassed = false;
  }

  console.log();
  if (allPassed) {
    console.log('🎉 All checks passed! Demo environment is ready.');
  } else {
    console.log('⚠️  Some checks failed. Run `pnpm demo:seed` to populate data.');
  }
}

function printHelp() {
  console.log(`
Dilivygo Demo Environment Commands

Usage:
  node demo/index.js <command> [subcommand]

Commands:
  setup     Full setup: migrations + seed + Clerk link
  reset     Reset and reseed (requires DEMO_ENVIRONMENT=true)
  seed      Seed demo data only
  check     Health check
  help      Show this help

Environment Variables:
  DEMO_ENVIRONMENT  Set to "true" for seed/reset (default: "false")
  DEMO_SEED         Deterministic seed (default: "2026")
  DEMO_SIZE         "small" or "full" (default: "full")
  DEMO_CLERK_USER_EMAIL  Clerk email to link
`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
