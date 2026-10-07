'use strict';

const { v4: uuidv4 } = require('uuid');
const BaseModel = require('./base.model');
const { select, insert, update, remove } = require('../lib/supabase');

function modifiersKey(mods) {
  if (!Array.isArray(mods) || !mods.length) return '';
  return JSON.stringify(
    [...mods].sort((a, b) => {
      const ga = `${a.groupName || ''}:${a.optionName || ''}:${a.modifierOptionId || ''}`;
      const gb = `${b.groupName || ''}:${b.optionName || ''}:${b.modifierOptionId || ''}`;
      return ga.localeCompare(gb);
    })
  );
}

function cartSyncFingerprint(line) {
  return [
    line.productId || '',
    line.productVariantId || '',
    line.shopId || '',
    line.projectRef || '',
    modifiersKey(line.selectedModifiers),
    String(line.notes || '').trim(),
  ].join('::');
}

function mapCartItemRow(row) {
  if (!row) return null;
  let mods = row.selected_modifiers;
  if (typeof mods === 'string') {
    try {
      mods = JSON.parse(mods);
    } catch {
      mods = undefined;
    }
  }
  return {
    id: row.id,
    sessionId: row.session_id,
    productId: row.product_id,
    productVariantId: row.product_variant_id || undefined,
    name: row.name,
    quantity: row.quantity,
    unitPriceCents: row.unit_price_cents,
    notes: row.notes || undefined,
    selectedModifiers: Array.isArray(mods) && mods.length ? mods : undefined,
    shopId: row.shop_id || undefined,
    projectRef: row.line_project_ref || undefined,
    shopName: row.shop_name || undefined,
    createdAt: row.created_at,
  };
}

class CartModel extends BaseModel {
  constructor() {
    super('cart_sessions');
  }

  async getOrCreate(sessionId, projectRef) {
    let session = await this.findOne({ id: sessionId, project_ref: projectRef });
    if (!session) {
      const existing = await this.findOne({ id: sessionId });
      if (existing) {
        await update(this.table, { project_ref: projectRef }, { id: sessionId });
        session = await this.findOne({ id: sessionId });
      } else {
        const rows = await insert(this.table, {
          id: sessionId || uuidv4(),
          project_ref: projectRef,
          customer_id: null,
          created_at: new Date().toISOString(),
        });
        session = Array.isArray(rows) ? rows[0] : rows;
      }
    }
    return session;
  }

  async findLatestCustomerSession(customerId, projectRef) {
    const rows = await select(this.table, {
      filters: { customer_id: customerId, project_ref: projectRef },
      order: 'created_at.desc',
      limit: 1,
    });
    return rows?.[0] || null;
  }

  async getOrCreateCustomerSession(customerId, projectRef) {
    let session = await this.findLatestCustomerSession(customerId, projectRef);
    if (session) return session;
    const id = uuidv4();
    const rows = await insert(this.table, {
      id,
      project_ref: projectRef,
      customer_id: customerId,
      created_at: new Date().toISOString(),
    });
    return Array.isArray(rows) ? rows[0] : rows;
  }

  async getWithItems(sessionId) {
    const session = await this.findOne({ id: sessionId });
    if (!session) return null;

    const rawItems = await select('cart_items', {
      filters: { session_id: sessionId },
      order: 'created_at.asc',
    });

    const items = (rawItems || []).map(mapCartItemRow).filter(Boolean);
    const totalCents = items.reduce(
      (sum, i) => sum + i.unitPriceCents * i.quantity,
      0
    );

    return {
      id: session.id,
      projectRef: session.project_ref,
      shopId: session.shop_id || undefined,
      customerId: session.customer_id || undefined,
      currency: session.currency || undefined,
      createdAt: session.created_at,
      items,
      totalCents,
    };
  }

  async addItem(sessionId, payload) {
    const {
      productId,
      productVariantId,
      name,
      quantity,
      unitPriceCents,
      notes,
      selectedModifiers,
      shopId,
      projectRef,
      shopName,
    } = payload;

    const candidates = await select('cart_items', {
      filters: { session_id: sessionId, product_id: productId || null },
    });
    const wantVid = productVariantId || null;
    const wantShopId = shopId || null;
    const wantProjectRef = projectRef || null;
    const wantNotes = String(notes || '').trim();
    const wantKey = modifiersKey(selectedModifiers);
    let match = null;
    for (const row of candidates || []) {
      const rid = row.product_variant_id || null;
      if (String(rid || '') !== String(wantVid || '')) continue;
      const rowShopId = row.shop_id || null;
      if (String(rowShopId || '') !== String(wantShopId || '')) continue;
      const rowProjectRef = row.line_project_ref || null;
      if (String(rowProjectRef || '') !== String(wantProjectRef || '')) continue;
      const rowNotes = String(row.notes || '').trim();
      if (rowNotes !== wantNotes) continue;
      let rowMods = row.selected_modifiers;
      if (typeof rowMods === 'string') {
        try {
          rowMods = JSON.parse(rowMods);
        } catch {
          rowMods = [];
        }
      }
      if (modifiersKey(rowMods) === wantKey) {
        match = row;
        break;
      }
    }

    if (match) {
      const rows = await update(
        'cart_items',
        { quantity: match.quantity + quantity },
        { id: match.id }
      );
      return Array.isArray(rows) ? rows[0] : rows;
    }

    const rows = await insert('cart_items', {
      id: uuidv4(),
      session_id: sessionId,
      product_id: productId || null,
      product_variant_id: productVariantId || null,
      name,
      quantity,
      unit_price_cents: unitPriceCents,
      notes: notes || null,
      selected_modifiers:
        Array.isArray(selectedModifiers) && selectedModifiers.length
          ? selectedModifiers
          : null,
      shop_id: shopId || null,
      line_project_ref: projectRef || null,
      shop_name: shopName || null,
      created_at: new Date().toISOString(),
    });
    return Array.isArray(rows) ? rows[0] : rows;
  }

  async findItemById(itemId) {
    const rows = await select('cart_items', {
      filters: { id: itemId },
      limit: 1,
    });
    return rows?.[0] || null;
  }

  async updateItem(itemId, { quantity }) {
    if (quantity <= 0) {
      return remove('cart_items', { id: itemId });
    }
    const rows = await update('cart_items', { quantity }, { id: itemId });
    return Array.isArray(rows) ? rows[0] : rows;
  }

  async removeItem(itemId) {
    return remove('cart_items', { id: itemId });
  }

  async clearItems(sessionId) {
    return remove('cart_items', { session_id: sessionId });
  }

  async replaceAllItems(sessionId, lines, sessionMeta = {}) {
    await remove('cart_items', { session_id: sessionId });
    const now = new Date().toISOString();
    const seenIds = new Set();
    const deduped = new Map();

    for (const rawLine of lines || []) {
      if (!rawLine) continue;
      const line = {
        ...rawLine,
        notes:
          typeof rawLine.notes === 'string' && rawLine.notes.trim()
            ? rawLine.notes.trim()
            : undefined,
        projectRef: rawLine.projectRef || sessionMeta.projectRef || null,
      };
      const fp = cartSyncFingerprint(line);
      const existing = deduped.get(fp);
      if (existing) {
        existing.quantity += line.quantity;
        if (!existing.shopName && line.shopName) existing.shopName = line.shopName;
        if (!existing.projectRef && line.projectRef) existing.projectRef = line.projectRef;
        continue;
      }

      let lineId = typeof line.id === 'string' && line.id ? line.id : uuidv4();
      if (seenIds.has(lineId)) {
        lineId = uuidv4();
      }
      seenIds.add(lineId);
      deduped.set(fp, { ...line, id: lineId });
    }

    const rows = Array.from(deduped.values()).map((line) => ({
      id: line.id,
      session_id: sessionId,
      product_id: line.productId || null,
      product_variant_id: line.productVariantId || null,
      name: line.name,
      quantity: line.quantity,
      unit_price_cents: line.unitPriceCents,
      notes: line.notes || null,
      selected_modifiers:
        Array.isArray(line.selectedModifiers) && line.selectedModifiers.length
          ? line.selectedModifiers
          : null,
      shop_id: line.shopId || null,
      line_project_ref: line.projectRef || null,
      shop_name: line.shopName || null,
      created_at: now,
    }));
    if (rows.length > 0) {
      await insert('cart_items', rows);
    }

    const sessionPatch = {};
    if (sessionMeta.shopId !== undefined) {
      sessionPatch.shop_id = sessionMeta.shopId;
    }
    if (sessionMeta.currency !== undefined) {
      sessionPatch.currency = sessionMeta.currency;
    }
    if (Object.keys(sessionPatch).length > 0) {
      await update(this.table, sessionPatch, { id: sessionId });
    }
  }

  async linkToCustomer(sessionId, customerId) {
    return update(this.table, { customer_id: customerId }, { id: sessionId });
  }

  /**
   * Merge guest cart items into a customer's existing cart.
   * Used on login when guest has items in their cart.
   */
  async mergeIntoSession(sourceSessionId, targetSessionId) {
    if (!sourceSessionId || sourceSessionId === targetSessionId) return;

    const sourceItems = await select('cart_items', { filters: { session_id: sourceSessionId } });
    if (!sourceItems || sourceItems.length === 0) return;

    for (const item of sourceItems) {
      let rowMods = item.selected_modifiers;
      if (typeof rowMods === 'string') {
        try {
          rowMods = JSON.parse(rowMods);
        } catch {
          rowMods = undefined;
        }
      }
      await this.addItem(targetSessionId, {
        productId: item.product_id,
        productVariantId: item.product_variant_id || undefined,
        name: item.name,
        quantity: item.quantity,
        unitPriceCents: item.unit_price_cents,
        notes: item.notes || undefined,
        selectedModifiers: Array.isArray(rowMods) && rowMods.length ? rowMods : undefined,
        shopId: item.shop_id || undefined,
        projectRef: item.line_project_ref || undefined,
        shopName: item.shop_name || undefined,
      });
    }

    await this.clearItems(sourceSessionId);
  }

  async cleanOldSessions(daysOld = 30) {
    const cutoff = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000).toISOString();
    await select(this.table, {
      select: 'id',
      filters: {},
    });
    const { supabaseFetch } = require('../lib/supabase');
    return supabaseFetch(
      `/rest/v1/${this.table}?created_at=lt.${encodeURIComponent(cutoff)}`,
      { method: 'DELETE' }
    );
  }
}

module.exports = new CartModel();
