import type {
  DeliveryMode,
  Order,
  OrderItem,
  OrderItemModifier,
  OrderStatus,
  PaymentStatus,
  PosCheckoutMode,
} from "@dilivygo/types";

function mapOrderItemModifiers(it: Record<string, unknown>): OrderItemModifier[] | undefined {
  const raw = it.order_item_modifiers ?? it.modifiers;
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const mapped = raw.map((m) => {
    const row = m as Record<string, unknown>;
    return {
      id: String(row.id ?? ""),
      orderItemId: String(row.order_item_id ?? row.orderItemId ?? it.id ?? ""),
      modifierOptionId: (row.modifier_option_id ?? row.modifierOptionId) as string | undefined,
      groupName: String(row.group_name ?? row.groupName ?? ""),
      optionName: String(row.option_name ?? row.optionName ?? ""),
      priceCents: Number(row.price_cents ?? row.priceCents ?? 0),
    };
  });
  return mapped.length ? mapped : undefined;
}

/**
 * Maps a single-order API payload (snake_case Supabase row and/or nested `order_items`)
 * into the shared `Order` shape used by web/mobile clients.
 */
export function normalizeOrder(raw: unknown): Order | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const items = (o.items ?? o.order_items) as Array<Record<string, unknown>> | undefined;

  const orderId = String(o.id ?? "");
  if (!orderId) return null;

  const mappedItems: OrderItem[] | undefined = items?.map((it) => {
    const notesVal = it.notes ?? it.note;
    const modifiers = mapOrderItemModifiers(it);
    const base: OrderItem = {
      id: String(it.id),
      orderId,
      productId: String(it.product_id ?? it.productId ?? ""),
      name: String(it.name ?? "Item"),
      quantity: Number(it.quantity ?? 0),
      unitPriceCents: Number(it.unitPriceCents ?? it.unit_price_cents ?? 0),
    };
    const pvid = it.product_variant_id ?? it.productVariantId;
    if (pvid != null && String(pvid).trim()) base.productVariantId = String(pvid);
    if (typeof notesVal === "string" && notesVal) base.notes = notesVal;
    if (modifiers?.length) base.modifiers = modifiers;
    return base;
  });

  const num = (a: unknown, b: unknown): number | undefined => {
    const v = a ?? b;
    if (v === null || v === undefined || v === "") return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };

  return {
    id: orderId,
    projectRef: String(o.project_ref ?? o.projectRef ?? ""),
    shopId: (o.shop_id ?? o.shopId) as string | undefined,
    customerId: String(o.customer_id ?? o.customerId ?? ""),
    status: (o.status ?? "placed") as OrderStatus,
    paymentStatus: (o.payment_status ?? o.paymentStatus ?? "pending") as PaymentStatus,
    paymentIntentId: (o.payment_intent_id ?? o.paymentIntentId) as string | undefined,
    totalCents: Number(o.total_cents ?? o.totalCents ?? 0),
    deliveryFeeCents: num(o.delivery_fee_cents, o.deliveryFeeCents),
    currency: (o.currency as string | undefined)?.toUpperCase(),
    refundAmountCents: num(o.refund_amount_cents, o.refundAmountCents),
    refundReason: (o.refund_reason ?? o.refundReason) as string | undefined,
    cancellationReason: (o.cancellation_reason ?? o.cancellationReason) as string | undefined,
    cancelledBy: (o.cancelled_by ?? o.cancelledBy) as string | undefined,
    scheduledFor: (o.scheduled_for ?? o.scheduledFor) as string | undefined,
    prepTimeMinutes: num(o.prep_time_minutes, o.prepTimeMinutes),
    slaDeadline: (o.sla_deadline ?? o.slaDeadline) as string | undefined,
    slaBreached: !!(o.sla_breached ?? o.slaBreached),
    deliveryMode: (o.delivery_mode ?? o.deliveryMode) as DeliveryMode | undefined,
    posCheckoutMode: (o.pos_checkout_mode ?? o.posCheckoutMode) as PosCheckoutMode | null | undefined,
    rejectionReason: (o.rejection_reason ?? o.rejectionReason) as string | undefined,
    discountCents: num(o.discount_cents, o.discountCents),
    promoCodeId: (o.promo_code_id ?? o.promoCodeId) as string | undefined,
    deliveryAddress: (o.delivery_address ?? o.deliveryAddress) as string | undefined,
    deliveryNotes: (o.delivery_notes ?? o.deliveryNotes) as string | undefined,
    cutleryRequested: !!(o.cutlery_requested ?? o.cutleryRequested),
    cutleryFeeCents: num(o.cutlery_fee_cents, o.cutleryFeeCents),
    createdAt: String(o.created_at ?? o.createdAt ?? ""),
    updatedAt: String(o.updated_at ?? o.updatedAt ?? ""),
    items: mappedItems,
    delivery: o.delivery as Order["delivery"],
    vendorId: (o.vendorId ?? o.vendor_id) as string | undefined,
    shop: o.shop as Order["shop"],
  } as Order;
}
