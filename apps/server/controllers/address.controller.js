'use strict';

const customerModel = require('../models/customer.model');
const { createError } = require('../middleware/error.middleware');

function toSnake(data) {
  const map = {
    addressLine1: 'address_line1',
    addressLine2: 'address_line2',
    isDefault: 'is_default',
  };
  const out = {};
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    out[map[k] || k] = v;
  }
  return out;
}

function toCamel(row) {
  if (!row) return null;
  return {
    id: row.id,
    customerId: row.customer_id,
    label: row.label || null,
    addressLine1: row.address_line1 || '',
    addressLine2: row.address_line2 || null,
    city: row.city || null,
    postcode: row.postcode || null,
    lat: row.lat != null ? Number(row.lat) : null,
    lon: row.lon != null ? Number(row.lon) : null,
    isDefault: !!row.is_default,
    createdAt: row.created_at,
  };
}

async function listAddresses(req, res, next) {
  try {
    const rows = await customerModel.getAddresses(req.customer.id);
    return res.json({ addresses: (rows || []).map(toCamel) });
  } catch (err) {
    next(err);
  }
}

async function createAddress(req, res, next) {
  try {
    const data = toSnake(req.body);
    const row = await customerModel.addAddress(req.customer.id, data);
    return res.status(201).json({ address: toCamel(row) });
  } catch (err) {
    next(err);
  }
}

async function updateAddress(req, res, next) {
  try {
    const { id } = req.params;
    const data = toSnake(req.body);
    const row = await customerModel.updateAddress(id, req.customer.id, data);
    if (!row) return next(createError('Address not found', 404));
    return res.json({ address: toCamel(row) });
  } catch (err) {
    next(err);
  }
}

async function setDefault(req, res, next) {
  try {
    const { id } = req.params;
    await customerModel.setDefaultAddress(id, req.customer.id);
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function deleteAddress(req, res, next) {
  try {
    const { id } = req.params;
    await customerModel.deleteAddress(id, req.customer.id);
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listAddresses,
  createAddress,
  updateAddress,
  setDefault,
  deleteAddress,
};
