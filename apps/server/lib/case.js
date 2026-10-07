'use strict';

const { parseBrowseCategoryIdsColumn } = require('./browse-categories');

function mapProduct(row, options = {}) {
  if (!row) return row;
  const forCustomer = options.forCustomer === true;
  const rawBarcode = row.barcode;
  const rawSku = row.sku;
  const barcode =
    rawBarcode != null && String(rawBarcode).trim()
      ? String(rawBarcode).trim()
      : undefined;
  const sku =
    rawSku != null && String(rawSku).trim() ? String(rawSku).trim() : undefined;
  const out = {
    id: row.id,
    projectRef: row.project_ref ?? row.projectRef,
    shopId: row.shop_id ?? row.shopId ?? undefined,
    name: row.name,
    description: row.description ?? undefined,
    priceCents: row.price_cents ?? row.priceCents,
    category: row.category ?? undefined,
    imageUrl: row.image_url ?? row.imageUrl ?? undefined,
    available: row.available ?? true,
    sortOrder: row.sort_order ?? row.sortOrder ?? 0,
    dietaryTags: Array.isArray(row.dietary_tags)
      ? row.dietary_tags
      : (Array.isArray(row.dietaryTags) ? row.dietaryTags : []),
    createdAt: row.created_at ?? row.createdAt,
    updatedAt: row.updated_at ?? row.updatedAt,
  };
  if (!forCustomer) {
    if (barcode) out.barcode = barcode;
    if (sku) out.sku = sku;
    if (row.commission_bps != null || row.commissionBps != null) {
      out.commissionBps = row.commission_bps ?? row.commissionBps;
    }
  }
  return out;
}

function mapProductVariant(row, options = {}) {
  if (!row) return row;
  const forCustomer = options.forCustomer === true;
  const rawBarcode = row.barcode;
  const rawSku = row.sku;
  const barcode =
    rawBarcode != null && String(rawBarcode).trim()
      ? String(rawBarcode).trim()
      : undefined;
  const sku =
    rawSku != null && String(rawSku).trim() ? String(rawSku).trim() : undefined;
  const stockRaw = row.stock_quantity ?? row.stockQuantity;
  const stockQuantity =
    stockRaw != null && Number.isFinite(Number(stockRaw)) ? Number(stockRaw) : undefined;
  const out = {
    id: row.id,
    productId: row.product_id ?? row.productId,
    name: row.name,
    priceCents: row.price_cents ?? row.priceCents,
    imageUrl: row.image_url ?? row.imageUrl ?? undefined,
    available: row.available !== false,
    sortOrder: row.sort_order ?? row.sortOrder ?? 0,
    createdAt: row.created_at ?? row.createdAt,
    updatedAt: row.updated_at ?? row.updatedAt,
  };
  if (stockQuantity !== undefined) out.stockQuantity = stockQuantity;
  if (!forCustomer) {
    if (barcode) out.barcode = barcode;
    if (sku) out.sku = sku;
  }
  return out;
}

function mapCategory(row) {
  if (!row) return row;
  return {
    id: row.id,
    projectRef: row.project_ref ?? row.projectRef,
    shopId: row.shop_id ?? row.shopId ?? undefined,
    name: row.name,
    sortOrder: row.sort_order ?? row.sortOrder ?? 0,
    createdAt: row.created_at ?? row.createdAt,
    updatedAt: row.updated_at ?? row.updatedAt,
  };
}

function mapWorkspace(row) {
  if (!row) return row;
  return {
    id: row.id,
    projectRef: row.project_ref ?? row.projectRef,
    name: row.name,
    description: row.description ?? undefined,
    logoUrl: row.logo_url ?? row.logoUrl ?? undefined,
    bannerUrl: row.banner_url ?? row.bannerUrl ?? undefined,
    address: row.address ?? undefined,
    phone: row.phone ?? undefined,
    lat: row.lat,
    lon: row.lon,
    currency: row.currency ?? undefined,
    promoCodesEnabled: row.promo_codes_enabled !== false,
    vendorDefaultCommissionBps: row.vendor_default_commission_bps ?? row.vendorDefaultCommissionBps ?? null,
    stripeConnectAccountId: row.stripe_connect_account_id ?? row.stripeConnectAccountId ?? null,
    stripeConnectChargesEnabled: row.stripe_connect_charges_enabled === true,
    stripeConnectPayoutsEnabled: row.stripe_connect_payouts_enabled === true,
    stripeConnectDetailsSubmitted: row.stripe_connect_details_submitted === true,
    createdAt: row.created_at ?? row.createdAt,
    updatedAt: row.updated_at ?? row.updatedAt,
  };
}

function mapShop(row) {
  if (!row) return row;
  const rawOperatingHours = row.operating_hours ?? row.operatingHours ?? null;
  let operatingHours = rawOperatingHours;
  if (typeof rawOperatingHours === 'string') {
    try { operatingHours = JSON.parse(rawOperatingHours); } catch { operatingHours = null; }
  }
  return {
    id: row.id,
    projectRef: row.project_ref ?? row.projectRef,
    name: row.name,
    slug: row.slug,
    description: row.description ?? undefined,
    logoUrl: row.logo_url ?? row.logoUrl ?? undefined,
    bannerUrl: row.banner_url ?? row.bannerUrl ?? undefined,
    address: row.address ?? undefined,
    phone: row.phone ?? undefined,
    lat: row.lat != null ? Number(row.lat) : undefined,
    lon: row.lon != null ? Number(row.lon) : undefined,
    deliveryGeofence: row.delivery_geofence ?? row.deliveryGeofence ?? null,
    operatingHours,
    timezone: row.timezone ?? row.timeZone ?? 'UTC',
    currency: row.currency ?? undefined,
    isActive: row.is_active ?? row.isActive ?? true,
    browseCategoryIds: parseBrowseCategoryIdsColumn(row.browse_category_ids ?? row.browseCategoryIds),
    createdAt: row.created_at ?? row.createdAt,
    updatedAt: row.updated_at ?? row.updatedAt,
  };
}

function mapRiderGeofence(row) {
  if (!row) return row;
  return {
    id: row.id,
    userId: row.user_id ?? row.userId,
    projectRef: row.project_ref ?? row.projectRef,
    geofence: row.geofence,
    createdAt: row.created_at ?? row.createdAt,
    updatedAt: row.updated_at ?? row.updatedAt,
  };
}

function mapModifierOption(row) {
  if (!row) return row;
  return {
    id: row.id,
    groupId: row.group_id ?? row.groupId,
    name: row.name,
    priceCents: row.price_cents ?? row.priceCents ?? 0,
    isDefault: row.is_default ?? row.isDefault ?? false,
    sortOrder: row.sort_order ?? row.sortOrder ?? 0,
    createdAt: row.created_at ?? row.createdAt,
  };
}

function mapModifierGroup(row) {
  if (!row) return row;
  return {
    id: row.id,
    productId: row.product_id ?? row.productId,
    name: row.name,
    required: row.required ?? false,
    minSelections: row.min_selections ?? row.minSelections ?? 0,
    maxSelections: row.max_selections ?? row.maxSelections ?? 1,
    sortOrder: row.sort_order ?? row.sortOrder ?? 0,
    options: (row.options || []).map(mapModifierOption),
    createdAt: row.created_at ?? row.createdAt,
    updatedAt: row.updated_at ?? row.updatedAt,
  };
}

function mapOrderItemModifier(row) {
  if (!row) return row;
  return {
    id: row.id,
    orderItemId: row.order_item_id ?? row.orderItemId,
    modifierOptionId: row.modifier_option_id ?? row.modifierOptionId ?? undefined,
    groupName: row.group_name ?? row.groupName,
    optionName: row.option_name ?? row.optionName,
    priceCents: row.price_cents ?? row.priceCents ?? 0,
  };
}

function mapConversation(row) {
  if (!row) return row;
  const supportClosedAt = row.support_closed_at ?? row.supportClosedAt ?? null;
  return {
    id: row.id,
    projectRef: row.project_ref ?? row.projectRef,
    orderId: row.order_id != null ? row.order_id : row.orderId ?? null,
    type: row.type,
    participant1Id: row.participant_1_id ?? row.participant1Id,
    participant2Id: row.participant_2_id ?? row.participant2Id,
    supportSubject: row.support_subject ?? row.supportSubject ?? null,
    supportClosedAt: supportClosedAt || null,
    createdAt: row.created_at ?? row.createdAt,
    updatedAt: row.updated_at ?? row.updatedAt,
  };
}

function mapMessage(row) {
  if (!row) return row;
  return {
    id: row.id,
    conversationId: row.conversation_id ?? row.conversationId,
    senderId: row.sender_id ?? row.senderId,
    senderRole: row.sender_role ?? row.senderRole,
    content: row.content,
    readAt: row.read_at ?? row.readAt ?? null,
    createdAt: row.created_at ?? row.createdAt,
  };
}

function mapSupportTicketRating(row) {
  if (!row) return row;
  return {
    id: row.id,
    conversationId: row.conversation_id ?? row.conversationId,
    projectRef: row.project_ref ?? row.projectRef,
    customerId: row.customer_id ?? row.customerId,
    ticketSubject: row.ticket_subject ?? row.ticketSubject ?? null,
    stars: Number(row.stars),
    comment: row.comment ?? null,
    createdAt: row.created_at ?? row.createdAt,
    updatedAt: row.updated_at ?? row.updatedAt,
  };
}

/**
 * Normalize a `deliveries` row (snake_case) into the camelCase `Delivery`
 * shape that the rider / vendor / customer apps expect (see
 * `packages/types/src/index.ts: Delivery`).
 *
 * Pass-through of fields that are already camelCase keeps this mapper safe
 * to apply to mixed sources (e.g. rider WS payloads already in camelCase).
 */
function mapDelivery(row) {
  if (!row) return row;
  return {
    id: row.id,
    orderId: row.order_id ?? row.orderId,
    riderId: row.rider_id ?? row.riderId ?? undefined,
    status: row.status,
    zoneId: row.zone_id ?? row.zoneId ?? undefined,
    etaMinutes: row.eta_minutes ?? row.etaMinutes ?? undefined,
    riderDeliveryFeeCents:
      row.rider_delivery_fee_cents ?? row.riderDeliveryFeeCents ?? undefined,
    claimedAt: row.claimed_at ?? row.claimedAt ?? undefined,
    externalRiderName: row.external_rider_name ?? row.externalRiderName ?? undefined,
    externalRiderPhone: row.external_rider_phone ?? row.externalRiderPhone ?? undefined,
    isExternal: row.is_external ?? row.isExternal ?? undefined,
    updatedAt: row.updated_at ?? row.updatedAt,
    createdAt: row.created_at ?? row.createdAt,
    orderSummary: row.order_summary ?? row.orderSummary ?? undefined,
  };
}

function mapVendorSettings(row) {
  if (!row) return row;
  let customDietaryTags = row.custom_dietary_tags ?? row.customDietaryTags ?? [];
  if (typeof customDietaryTags === 'string') {
    try {
      customDietaryTags = JSON.parse(customDietaryTags);
    } catch {
      customDietaryTags = [];
    }
  }
  if (!Array.isArray(customDietaryTags)) customDietaryTags = [];
  return {
    id: row.id,
    projectRef: row.project_ref ?? row.projectRef,
    shopId: row.shop_id ?? row.shopId ?? undefined,
    autoAccept: row.auto_accept ?? row.autoAccept ?? false,
    defaultPrepTimeMinutes: row.default_prep_time_minutes ?? row.defaultPrepTimeMinutes ?? 20,
    deliveryMode: row.delivery_mode ?? row.deliveryMode ?? 'third_party',
    autoDispatchDelayMinutes: row.auto_dispatch_delay_minutes ?? row.autoDispatchDelayMinutes ?? 0,
    minimumOrderCents: row.minimum_order_cents ?? row.minimumOrderCents ?? 0,
    cutleryOffered: row.cutlery_offered ?? row.cutleryOffered ?? false,
    cutleryFeeCents: row.cutlery_fee_cents ?? row.cutleryFeeCents ?? 0,
    customDietaryTags: customDietaryTags
      .map((r) => ({
        code: String(r.code || '').toLowerCase().trim(),
        label: String(r.label || r.code || '').trim(),
      }))
      .filter((r) => r.code && r.label),
    createdAt: row.created_at ?? row.createdAt,
    updatedAt: row.updated_at ?? row.updatedAt,
  };
}

module.exports = {
  mapProduct,
  mapProductVariant,
  mapCategory,
  mapWorkspace,
  mapShop,
  mapRiderGeofence,
  mapModifierGroup,
  mapModifierOption,
  mapOrderItemModifier,
  mapConversation,
  mapMessage,
  mapSupportTicketRating,
  mapVendorSettings,
  mapDelivery,
};
