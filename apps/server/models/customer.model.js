'use strict';

const { v4: uuidv4 } = require('uuid');
const BaseModel = require('./base.model');
const { select } = require('../lib/supabase');
const { MARKETPLACE_ORGANIZATION_ID } = require('../lib/platform-constants');

class CustomerModel extends BaseModel {
  constructor() {
    super('customers');
  }

  /** Find a customer by phone within a specific organization (the canonical scope). */
  async findByPhoneInOrganization(phone, organizationId) {
    if (!phone || !organizationId) return null;
    return this.findOne({ phone, organization_id: organizationId });
  }

  /** Find a customer by email within a specific organization. */
  async findByEmailInOrganization(email, organizationId) {
    if (!email || !organizationId) return null;
    return this.findOne({
      email: String(email).trim().toLowerCase(),
      organization_id: organizationId,
    });
  }

  /**
   * SECURITY (audit finding #7): the four legacy lookups below
   * (`findByPhone`, `findByEmail`, `findByPhoneProject`, `findByEmailProject`)
   * ignored `organization_id` and could leak customers across tenants. They
   * were dead at audit time but kept exported, which is a footgun for any
   * future engineer. They are deliberately retained as throwing stubs so
   * that any reintroduction is loud.
   */
  async findByPhone(/* phone */) {
    throw new Error(
      'customerModel.findByPhone is unsafe — use findByPhoneInOrganization(phone, organizationId)',
    );
  }

  async findByEmail(/* email */) {
    throw new Error(
      'customerModel.findByEmail is unsafe — use findByEmailInOrganization(email, organizationId)',
    );
  }

  async findByPhoneProject(/* phone, projectRef */) {
    throw new Error(
      'customerModel.findByPhoneProject is unsafe — use findByPhoneInOrganization(phone, organizationId)',
    );
  }

  async findByEmailProject(/* email, projectRef */) {
    throw new Error(
      'customerModel.findByEmailProject is unsafe — use findByEmailInOrganization(email, organizationId)',
    );
  }

  /**
   * Find-or-create a customer within an organization.
   * @param {{ phone: string, organizationId: string }} input
   */
  async findOrCreateInOrganization({ phone, organizationId }) {
    if (!phone) throw new Error('phone is required');
    if (!organizationId) throw new Error('organizationId is required');
    const existing = await this.findByPhoneInOrganization(phone, organizationId);
    if (existing) return { customer: existing, created: false };

    const customer = await super.create({
      id: uuidv4(),
      phone,
      organization_id: organizationId,
      project_ref: null,
      created_at: new Date().toISOString(),
    });
    return { customer, created: true };
  }

  /**
   * Find-or-create a customer by email within an organization.
   * Allows email-only account creation without requiring a phone number.
   * @param {{ email: string, organizationId: string }} input
   */
  async findOrCreateByEmailInOrganization({ email, organizationId }) {
    if (!email) throw new Error('email is required');
    if (!organizationId) throw new Error('organizationId is required');
    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = await this.findByEmailInOrganization(normalizedEmail, organizationId);
    if (existing) return { customer: existing, created: false };

    const customer = await super.create({
      id: uuidv4(),
      email: normalizedEmail,
      organization_id: organizationId,
      project_ref: null,
      created_at: new Date().toISOString(),
    });
    return { customer, created: true };
  }

  /**
   * @deprecated Use `findOrCreateInOrganization`. Kept for callers that have not
   * been migrated yet; falls back to the marketplace bucket when no org is supplied.
   */
  async findOrCreate({ phone, projectRef: _legacyProjectRef, organizationId }) {
    const orgId = organizationId || MARKETPLACE_ORGANIZATION_ID;
    return this.findOrCreateInOrganization({ phone, organizationId: orgId });
  }

  async updateProfile(customerId, { name, email }) {
    const patch = {};
    if (name !== undefined) patch.name = name;
    if (email !== undefined) patch.email = email ? String(email).trim().toLowerCase() : email;
    return this.updateById(customerId, patch);
  }

  async updatePhone(customerId, phone) {
    return this.updateById(customerId, { phone });
  }

  async getAddresses(customerId) {
    return select('customer_addresses', {
      filters: { customer_id: customerId },
      order: 'is_default.desc,created_at.asc',
    });
  }

  async addAddress(customerId, addressData) {
    const { insert } = require('../lib/supabase');
    if (addressData.is_default) {
      const { update } = require('../lib/supabase');
      await update('customer_addresses', { is_default: false }, { customer_id: customerId });
    }
    return insert('customer_addresses', {
      id: uuidv4(),
      customer_id: customerId,
      ...addressData,
      created_at: new Date().toISOString(),
    });
  }

  async updateAddress(addressId, customerId, data) {
    const { update, select: sel } = require('../lib/supabase');
    if (data.is_default) {
      await update('customer_addresses', { is_default: false }, { customer_id: customerId });
    }
    await update('customer_addresses', data, { id: addressId, customer_id: customerId });
    const rows = await sel('customer_addresses', { filters: { id: addressId }, limit: 1 });
    return rows?.[0] ?? null;
  }

  async setDefaultAddress(addressId, customerId) {
    const { update } = require('../lib/supabase');
    await update('customer_addresses', { is_default: false }, { customer_id: customerId });
    await update('customer_addresses', { is_default: true }, { id: addressId, customer_id: customerId });
  }

  async deleteAddress(addressId, customerId) {
    const { remove } = require('../lib/supabase');
    return remove('customer_addresses', { id: addressId, customer_id: customerId });
  }
}

module.exports = new CustomerModel();
