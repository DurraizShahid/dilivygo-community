'use strict';

const { v4: uuidv4 } = require('uuid');
const BaseModel = require('./base.model');

class IntegrationRequestModel extends BaseModel {
  constructor() {
    super('integration_requests');
  }

  async create({ organization_id, integration_name, integration_category, requester_name, requester_email }) {
    return super.create({
      id: uuidv4(),
      organization_id,
      integration_name,
      integration_category,
      requester_name: requester_name || null,
      requester_email: requester_email || null,
      status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  async listByOrganization(organizationId) {
    return this.findMany({ organization_id: organizationId }, { order: 'created_at desc' });
  }

  async listAll() {
    return this.findMany({}, { order: 'created_at desc' });
  }

  async updateStatus(id, status) {
    return this.updateById(id, {
      status,
      updated_at: new Date().toISOString(),
    });
  }
}

module.exports = new IntegrationRequestModel();
