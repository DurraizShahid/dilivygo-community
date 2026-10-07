-- Migration: 038_notification_templates
-- Editable notification templates for email + push notifications

CREATE TABLE IF NOT EXISTS notification_templates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         TEXT UNIQUE NOT NULL,
  name         TEXT NOT NULL,
  description  TEXT,
  channel      TEXT NOT NULL DEFAULT 'both' CHECK (channel IN ('email', 'push', 'both')),
  email_subject TEXT,
  email_html   TEXT,
  push_title   TEXT,
  push_body    TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_templates_slug ON notification_templates(slug);

-- Seed default templates

INSERT INTO notification_templates (slug, name, description, channel, email_subject, email_html, push_title, push_body) VALUES

-- Customer: Order Confirmation
('order_confirmation', 'Order Confirmation', 'Sent to customer when an order is successfully placed', 'both',
 'Your order #{{orderNumber}} has been placed!',
 '<h2>Order Confirmed!</h2>
<p>Hi {{customerName}},</p>
<p>Your order <strong>#{{orderNumber}}</strong> from <strong>{{shopName}}</strong> has been placed successfully.</p>
<table style="width:100%;border-collapse:collapse;margin:16px 0;">
  <tr style="background:#f8f8f8;"><th style="text-align:left;padding:8px;border-bottom:1px solid #eee;">Item</th><th style="text-align:right;padding:8px;border-bottom:1px solid #eee;">Amount</th></tr>
  {{itemRows}}
  <tr style="font-weight:700;"><td style="padding:8px;border-top:2px solid #333;">Total</td><td style="text-align:right;padding:8px;border-top:2px solid #333;">{{totalFormatted}}</td></tr>
</table>
{{#if deliveryAddress}}<p><strong>Delivery to:</strong> {{deliveryAddress}}</p>{{/if}}
<p>We''ll notify you when the restaurant starts preparing your order.</p>',
 'Order Confirmed!',
 'Your order #{{orderNumber}} from {{shopName}} has been placed'),

-- Customer: Order Accepted
('order_accepted', 'Order Accepted', 'Sent to customer when vendor accepts the order', 'push',
 NULL, NULL,
 'Order Accepted',
 'Your order #{{orderNumber}} has been accepted by {{shopName}}'),

-- Customer: Order Preparing
('order_preparing', 'Order Preparing', 'Sent to customer when the order is being prepared', 'push',
 NULL, NULL,
 'Preparing Your Order',
 '{{shopName}} is now preparing your order #{{orderNumber}}'),

-- Customer: Order Ready
('order_ready', 'Order Ready', 'Sent to customer when the order is ready for pickup/delivery', 'push',
 NULL, NULL,
 'Order Ready!',
 'Your order #{{orderNumber}} is ready {{#if deliveryMode}}for delivery{{else}}for pickup{{/if}}'),

-- Customer: Order Picked Up (out for delivery)
('order_picked_up', 'Out for Delivery', 'Sent to customer when rider picks up the order', 'push',
 NULL, NULL,
 'On Its Way!',
 'Your order #{{orderNumber}} is on its way to you'),

-- Customer: Rider Arrived
('rider_arrived', 'Rider Arrived', 'Sent to customer when the delivery rider arrives', 'push',
 NULL, NULL,
 'Rider Arrived',
 'Your rider has arrived with your order #{{orderNumber}}!'),

-- Customer: Order Completed (receipt)
('order_completed', 'Order Completed / Receipt', 'Sent to customer when order is delivered or completed', 'both',
 'Your order #{{orderNumber}} has been delivered!',
 '<h2>Order Delivered!</h2>
<p>Hi {{customerName}},</p>
<p>Your order <strong>#{{orderNumber}}</strong> from <strong>{{shopName}}</strong> has been delivered.</p>
<table style="width:100%;border-collapse:collapse;margin:16px 0;">
  <tr style="background:#f8f8f8;"><th style="text-align:left;padding:8px;border-bottom:1px solid #eee;">Item</th><th style="text-align:right;padding:8px;border-bottom:1px solid #eee;">Amount</th></tr>
  {{itemRows}}
  <tr style="font-weight:700;"><td style="padding:8px;border-top:2px solid #333;">Total</td><td style="text-align:right;padding:8px;border-top:2px solid #333;">{{totalFormatted}}</td></tr>
</table>
<p>Thank you for your order! We''d love to hear your feedback.</p>',
 'Order Delivered',
 'Your order #{{orderNumber}} has been delivered! Rate your experience'),

-- Customer: Order Cancelled
('order_cancelled', 'Order Cancelled', 'Sent to customer when their order is cancelled', 'both',
 'Your order #{{orderNumber}} has been cancelled',
 '<h2>Order Cancelled</h2>
<p>Hi {{customerName}},</p>
<p>Your order <strong>#{{orderNumber}}</strong> has been cancelled.</p>
{{#if reason}}<p><strong>Reason:</strong> {{reason}}</p>{{/if}}
{{#if wasRefunded}}<p>A full refund has been issued and will appear in 5–10 business days.</p>{{/if}}
<p>We apologise for the inconvenience.</p>',
 'Order Cancelled',
 'Your order #{{orderNumber}} has been cancelled{{#if reason}}: {{reason}}{{/if}}'),

-- Customer: Order Rejected
('order_rejected', 'Order Rejected', 'Sent to customer when vendor rejects the order', 'both',
 'Your order #{{orderNumber}} was not accepted',
 '<h2>Order Not Accepted</h2>
<p>Hi {{customerName}},</p>
<p>Unfortunately, <strong>{{shopName}}</strong> was unable to accept your order <strong>#{{orderNumber}}</strong>.</p>
{{#if reason}}<p><strong>Reason:</strong> {{reason}}</p>{{/if}}
{{#if wasRefunded}}<p>A full refund has been issued and will appear in 5–10 business days.</p>{{/if}}
<p>We apologise for the inconvenience.</p>',
 'Order Rejected',
 'Your order #{{orderNumber}} was rejected by {{shopName}}'),

-- Customer: Refund Confirmation
('order_refund', 'Refund Confirmation', 'Sent to customer when a refund is processed', 'both',
 'Refund confirmed for order #{{orderNumber}}',
 '<h2>Your Refund Has Been Processed</h2>
<p>Hi {{customerName}},</p>
<p>A refund of <strong>{{refundAmount}}</strong> has been processed for order <strong>#{{orderNumber}}</strong>.</p>
<p>Please allow 5–10 business days for the funds to appear in your account.</p>',
 'Refund Processed',
 'Refund of {{refundAmount}} confirmed for order #{{orderNumber}}'),

-- Customer: Order Delayed
('order_delayed', 'Order Delayed', 'Sent to customer when order misses SLA deadline', 'push',
 NULL, NULL,
 'Order Delayed',
 'Your order #{{orderNumber}} is taking longer than expected. We apologise for the delay'),

-- Vendor: New Order
('new_order_vendor', 'New Order (Vendor)', 'Sent to vendor when a new order is placed', 'push',
 NULL, NULL,
 'New Order!',
 'New order #{{orderNumber}} has been placed ({{totalFormatted}})'),

-- Rider: Delivery Assigned
('delivery_assigned', 'Delivery Assigned', 'Sent to rider when a delivery is assigned to them', 'push',
 NULL, NULL,
 'New Delivery',
 'A delivery has been assigned to you for order #{{orderNumber}}'),

-- Rider: Delivery Request
('delivery_request', 'Delivery Available', 'Sent to rider when a new delivery is available nearby', 'push',
 NULL, NULL,
 'New Delivery Available',
 'New delivery available near you'),

-- Chat: New Message
('chat_message', 'New Chat Message', 'Sent when a user receives a chat message while offline', 'push',
 NULL, NULL,
 'New message from {{senderName}}',
 'Tap to view')

ON CONFLICT (slug) DO NOTHING;
