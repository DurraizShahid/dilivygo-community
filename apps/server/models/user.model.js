'use strict';

const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const BaseModel = require('./base.model');
const { update, select } = require('../lib/supabase');

const SALT_ROUNDS = 12;

class UserModel extends BaseModel {
  constructor() {
    super('app_users');
  }

  /**
   * Look up a staff user by email across the entire deployment.
   *
   * NOTE: staff email uniqueness is scoped per organization (see migration
   * 082). Use this only when the caller genuinely has no organization context
   * — e.g. the platform superadmin console or a host-unscoped login — and be
   * prepared for more than one row to match across tenants. Prefer
   * {@link UserModel#findByEmailInOrganization} everywhere org context is
   * available.
   */
  async findByEmail(email) {
    return this.findOne({ email });
  }

  /**
   * Look up a staff user by email within a specific organization. This is the
   * canonical lookup for tenant-scoped flows (SaaS staff CRUD, tenant-host
   * logins, etc.) because two independent organizations are allowed to have
   * staff with the same email address.
   *
   * @param {string|null|undefined} email
   * @param {string|null|undefined} organizationId
   * @returns {Promise<object|null>}
   */
  async findByEmailInOrganization(email, organizationId) {
    if (!email || !organizationId) return null;
    return this.findOne({
      email: String(email).trim().toLowerCase(),
      organization_id: organizationId,
    });
  }

  async findByProjectRef(projectRef, role) {
    const filters = { project_ref: projectRef };
    if (role) filters.role = role;
    return this.findMany(filters);
  }

  async create({
    email,
    password,
    role,
    projectRef,
    organizationId,
    displayName,
    firstName,
    lastName,
  }) {
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const trimmedName = displayName != null ? String(displayName).trim() : '';
    const tf = firstName != null ? String(firstName).trim() : '';
    const tl = lastName != null ? String(lastName).trim() : '';
    /** @type {Record<string, unknown>} */
    const row = {
      id: uuidv4(),
      email,
      password_hash: passwordHash,
      role,
      project_ref: projectRef ?? null,
      display_name: trimmedName || null,
      first_name: tf || null,
      last_name: tl || null,
      totp_enabled: false,
      created_at: new Date().toISOString(),
    };
    // When the caller knows the organization (e.g. SaaS staff endpoints
    // creating an org-wide rider with project_ref = null), pass it explicitly
    // so the row doesn't fall back to the cross-org marketplace bucket via the
    // `trg_app_users_org` trigger. When project_ref is set, the trigger will
    // overwrite this with the workspace's organization_id, which is desired.
    if (organizationId) row.organization_id = organizationId;
    const user = await super.create(row);
    // POS / catalog use `user_shops`; admins skip that check. New vendors must be
    // linked to existing shops or they see shops in the UI but empty menus.
    if (role === 'vendor' && projectRef) {
      const shopModel = require('./shop.model');
      const userShopModel = require('./user-shop.model');
      const shops = await shopModel.findByProjectRef(String(projectRef), { includeInactive: true });
      for (const s of shops || []) {
        await userShopModel.assignUser(user.id, s.id).catch(() => {});
      }
    }
    return user;
  }

  async verifyPassword(user, password) {
    return bcrypt.compare(password, user.password_hash);
  }

  async updatePassword(userId, newPassword) {
    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    return update(this.table, { password_hash: passwordHash }, { id: userId });
  }

  async enableTOTP(userId, totpSecret) {
    return update(this.table, { totp_secret: totpSecret, totp_enabled: true }, { id: userId });
  }

  async disableTOTP(userId) {
    return update(this.table, { totp_secret: null, totp_enabled: false }, { id: userId });
  }

  // Return user without sensitive fields
  sanitise(user) {
    if (!user) return null;
    const { password_hash, totp_secret, ...safe } = user;
    return safe;
  }

  /** Single string for JWT/session `name`: display_name, else "first last". */
  staffSessionDisplayName(row) {
    if (!row) return undefined;
    const d = row.display_name != null ? String(row.display_name).trim() : '';
    if (d) return d;
    const f = row.first_name != null ? String(row.first_name).trim() : '';
    const l = row.last_name != null ? String(row.last_name).trim() : '';
    const joined = [f, l].filter(Boolean).join(' ');
    return joined || undefined;
  }

  /** CamelCase staff user for API responses (login, session, superadmin user CRUD). */
  toPublicStaffUser(row) {
    if (!row) return null;
    const u = this.sanitise(row);
    const trimOrNull = (v) => {
      if (v == null) return null;
      const s = String(v).trim();
      return s || null;
    };
    const firstName = trimOrNull(u.first_name ?? u.firstName);
    const lastName = trimOrNull(u.last_name ?? u.lastName);
    return {
      id: u.id,
      email: u.email,
      role: u.role,
      projectRef: u.project_ref ?? null,
      name: u.display_name ?? null,
      firstName,
      lastName,
      totpEnabled: u.totp_enabled ?? false,
      commissionOverrideBps: u.commission_override_bps ?? null,
      createdAt: u.created_at,
      stripeConnectAccountId: u.stripe_connect_account_id ?? null,
      payoutMethod: u.payout_method ?? null,
    };
  }
}

module.exports = new UserModel();
