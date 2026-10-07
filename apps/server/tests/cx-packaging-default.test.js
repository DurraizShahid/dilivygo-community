'use strict';

const fs = require('fs');
const path = require('path');
const {
  TENANT_SETTING_DEFAULTS,
  defaultForKey,
} = require('../lib/tenant-settings-defaults');

describe('CX packaging default safety', () => {
  test('new or genuinely missing tenant settings default to starter', () => {
    expect(TENANT_SETTING_DEFAULTS.cx_package).toBe('starter');
    expect(defaultForKey('cx_package')).toBe('starter');
  });

  test('migration 135 preserves existing-org access by explicitly seeding intelligence', () => {
    const migrationPath = path.join(__dirname, '../migrations/135_cx_packaging.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    expect(sql).toContain("SELECT o.id, 'cx_package', 'intelligence'");
    expect(sql).toContain('WHERE NOT EXISTS');
    expect(sql).toContain('ON CONFLICT (organization_id, key) DO NOTHING');
  });
});
