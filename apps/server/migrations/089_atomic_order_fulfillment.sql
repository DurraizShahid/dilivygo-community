-- Migration: 089_atomic_order_fulfillment
-- One transaction creates the paid order snapshot, items, modifiers and promo
-- redemption. Retries return the existing order for the same PaymentIntent/shop.

CREATE OR REPLACE FUNCTION create_order_with_items_atomic(
  p_order JSONB,
  p_items JSONB DEFAULT '[]'::JSONB,
  p_record_promo_redemption BOOLEAN DEFAULT TRUE
)
RETURNS TABLE(order_id UUID, created BOOLEAN)
LANGUAGE plpgsql
AS $$
DECLARE
  v_order_id UUID := COALESCE(NULLIF(p_order->>'id', '')::UUID, gen_random_uuid());
  v_payment_intent_id TEXT := NULLIF(p_order->>'payment_intent_id', '');
  v_shop_id UUID := NULLIF(p_order->>'shop_id', '')::UUID;
  v_customer_id UUID := NULLIF(p_order->>'customer_id', '')::UUID;
  v_promo_code_id UUID := NULLIF(p_order->>'promo_code_id', '')::UUID;
  v_item JSONB;
  v_modifier JSONB;
  v_item_id UUID;
  v_variant_id UUID;
  v_inserted INTEGER := 0;
  v_max_uses INTEGER;
  v_max_uses_per_customer INTEGER;
  v_times_used INTEGER;
  v_customer_uses INTEGER;
BEGIN
  IF v_shop_id IS NULL THEN
    RAISE EXCEPTION 'shop_id is required';
  END IF;

  INSERT INTO orders (
    id,
    project_ref,
    shop_id,
    customer_id,
    status,
    payment_status,
    payment_intent_id,
    total_cents,
    delivery_fee_cents,
    discount_cents,
    promo_code_id,
    currency,
    delivery_address,
    delivery_notes,
    scheduled_for,
    prep_time_minutes,
    sla_deadline,
    sla_breached,
    delivery_mode,
    rejection_reason,
    pos_checkout_mode,
    cutlery_requested,
    cutlery_fee_cents,
    created_at,
    updated_at
  ) VALUES (
    v_order_id,
    p_order->>'project_ref',
    v_shop_id,
    v_customer_id,
    p_order->>'status',
    COALESCE(NULLIF(p_order->>'payment_status', ''), 'unpaid'),
    v_payment_intent_id,
    COALESCE((p_order->>'total_cents')::INTEGER, 0),
    COALESCE((p_order->>'delivery_fee_cents')::INTEGER, 0),
    COALESCE((p_order->>'discount_cents')::INTEGER, 0),
    v_promo_code_id,
    COALESCE(NULLIF(p_order->>'currency', ''), 'gbp'),
    NULLIF(p_order->>'delivery_address', ''),
    NULLIF(p_order->>'delivery_notes', ''),
    NULLIF(p_order->>'scheduled_for', '')::TIMESTAMPTZ,
    NULL,
    NULL,
    FALSE,
    NULL,
    NULL,
    NULLIF(p_order->>'pos_checkout_mode', ''),
    COALESCE((p_order->>'cutlery_requested')::BOOLEAN, FALSE),
    COALESCE((p_order->>'cutlery_fee_cents')::INTEGER, 0),
    COALESCE(NULLIF(p_order->>'created_at', '')::TIMESTAMPTZ, NOW()),
    COALESCE(NULLIF(p_order->>'updated_at', '')::TIMESTAMPTZ, NOW())
  )
  ON CONFLICT (payment_intent_id, shop_id)
    WHERE payment_intent_id IS NOT NULL AND shop_id IS NOT NULL
  DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted = 0 THEN
    SELECT o.id
      INTO v_order_id
      FROM orders o
     WHERE o.payment_intent_id = v_payment_intent_id
       AND o.shop_id = v_shop_id
     LIMIT 1;

    IF v_order_id IS NULL THEN
      RAISE EXCEPTION 'order idempotency conflict without existing order';
    END IF;

    RETURN QUERY SELECT v_order_id, FALSE;
    RETURN;
  END IF;

  FOR v_item IN
    SELECT value FROM jsonb_array_elements(COALESCE(p_items, '[]'::JSONB))
  LOOP
    v_item_id := COALESCE(NULLIF(v_item->>'id', '')::UUID, gen_random_uuid());
    v_variant_id := NULLIF(COALESCE(v_item->>'product_variant_id', v_item->>'productVariantId'), '')::UUID;

    INSERT INTO order_items (
      id,
      order_id,
      product_id,
      product_variant_id,
      name,
      quantity,
      unit_price_cents,
      notes
    ) VALUES (
      v_item_id,
      v_order_id,
      NULLIF(COALESCE(v_item->>'product_id', v_item->>'productId'), '')::UUID,
      v_variant_id,
      v_item->>'name',
      (v_item->>'quantity')::INTEGER,
      COALESCE((COALESCE(v_item->>'unit_price_cents', v_item->>'unitPriceCents'))::INTEGER, 0),
      NULLIF(v_item->>'notes', '')
    );

    FOR v_modifier IN
      SELECT value
        FROM jsonb_array_elements(COALESCE(v_item->'modifiers', '[]'::JSONB))
    LOOP
      INSERT INTO order_item_modifiers (
        id,
        order_item_id,
        modifier_option_id,
        group_name,
        option_name,
        price_cents
      ) VALUES (
        gen_random_uuid(),
        v_item_id,
        NULLIF(COALESCE(v_modifier->>'modifier_option_id', v_modifier->>'modifierOptionId'), '')::UUID,
        COALESCE(v_modifier->>'group_name', v_modifier->>'groupName'),
        COALESCE(v_modifier->>'option_name', v_modifier->>'optionName'),
        COALESCE((COALESCE(v_modifier->>'price_cents', v_modifier->>'priceCents'))::INTEGER, 0)
      );
    END LOOP;
  END LOOP;

  IF p_record_promo_redemption
     AND v_promo_code_id IS NOT NULL
     AND v_customer_id IS NOT NULL THEN
    SELECT max_uses, max_uses_per_customer, times_used
      INTO v_max_uses, v_max_uses_per_customer, v_times_used
      FROM promo_codes
     WHERE id = v_promo_code_id
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'promo code no longer exists';
    END IF;

    IF v_max_uses IS NOT NULL AND v_times_used >= v_max_uses THEN
      RAISE EXCEPTION 'promo code usage limit reached';
    END IF;

    SELECT COUNT(*)::INTEGER
      INTO v_customer_uses
      FROM promo_redemptions
     WHERE promo_code_id = v_promo_code_id
       AND customer_id = v_customer_id;

    IF v_max_uses_per_customer IS NOT NULL
       AND v_customer_uses >= v_max_uses_per_customer THEN
      RAISE EXCEPTION 'promo code customer usage limit reached';
    END IF;

    UPDATE promo_codes
       SET times_used = times_used + 1,
           updated_at = NOW()
     WHERE id = v_promo_code_id;

    INSERT INTO promo_redemptions (
      id,
      promo_code_id,
      order_id,
      customer_id,
      discount_cents,
      created_at
    ) VALUES (
      gen_random_uuid(),
      v_promo_code_id,
      v_order_id,
      v_customer_id,
      COALESCE((p_order->>'discount_cents')::INTEGER, 0),
      NOW()
    );
  END IF;

  RETURN QUERY SELECT v_order_id, TRUE;
END;
$$;
