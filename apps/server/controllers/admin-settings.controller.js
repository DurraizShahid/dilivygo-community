'use strict';

const adminSettingsModel = require('../models/admin-settings.model');

const DEFAULTS = {
  avg_delivery_time_minutes: 30,
  auto_dispatch_delay_minutes: 5,
  max_search_radius_km: 15.0,
};

function toCamel(row) {
  if (!row) return DEFAULTS;
  return {
    id: row.id,
    projectRef: row.project_ref,
    avgDeliveryTimeMinutes: row.avg_delivery_time_minutes ?? DEFAULTS.avg_delivery_time_minutes,
    autoDispatchDelayMinutes: row.auto_dispatch_delay_minutes ?? DEFAULTS.auto_dispatch_delay_minutes,
    maxSearchRadiusKm: row.max_search_radius_km ?? DEFAULTS.max_search_radius_km,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toSnake(body) {
  const out = {};
  if (body.avgDeliveryTimeMinutes !== undefined) out.avg_delivery_time_minutes = body.avgDeliveryTimeMinutes;
  if (body.autoDispatchDelayMinutes !== undefined) out.auto_dispatch_delay_minutes = body.autoDispatchDelayMinutes;
  if (body.maxSearchRadiusKm !== undefined) out.max_search_radius_km = body.maxSearchRadiusKm;
  return out;
}

async function getSettings(req, res, next) {
  try {
    const row = await adminSettingsModel.getByProjectRef(req.projectRef);
    return res.json({ settings: toCamel(row) });
  } catch (err) {
    next(err);
  }
}

async function updateSettings(req, res, next) {
  try {
    const data = toSnake(req.body);
    const row = await adminSettingsModel.upsertByProjectRef(req.projectRef, data);
    return res.json({ settings: toCamel(row) });
  } catch (err) {
    next(err);
  }
}

module.exports = { getSettings, updateSettings };
