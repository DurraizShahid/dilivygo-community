'use strict';

const BaseModel = require('./base.model');

class PromotionalNotificationModel extends BaseModel {
  constructor() {
    super('promotional_notifications');
  }

  async listAll({ status, limit = 50, offset = 0, organizationId } = {}) {
    const filters = {};
    if (status) filters.status = status;
    if (organizationId) filters.organization_id = organizationId;
    return this.findMany(filters, {
      order: 'created_at.desc',
      limit,
      offset,
    });
  }
}

module.exports = new PromotionalNotificationModel();
