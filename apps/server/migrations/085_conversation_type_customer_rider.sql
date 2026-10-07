-- Split customer↔rider order threads from vendor↔rider coordination (previously both used type vendor_rider).

ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_type_check;
ALTER TABLE conversations ADD CONSTRAINT conversations_type_check
  CHECK (type IN ('customer_vendor', 'vendor_rider', 'customer_support', 'customer_rider'));

-- Rows where both participants are the order's customer and delivery rider (legacy mis-tagged vendor_rider).
UPDATE conversations c
SET type = 'customer_rider', updated_at = NOW()
FROM deliveries d
JOIN orders o ON o.id = d.order_id
WHERE c.order_id = d.order_id
  AND c.type = 'vendor_rider'
  AND o.customer_id IS NOT NULL
  AND d.rider_id IS NOT NULL
  AND (
    (c.participant_1_id = o.customer_id AND c.participant_2_id = d.rider_id)
    OR (c.participant_2_id = o.customer_id AND c.participant_1_id = d.rider_id)
  );
