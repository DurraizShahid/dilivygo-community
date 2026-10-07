-- Product variants: purchasable SKUs per product (size, volume, pack, etc.)

CREATE TABLE IF NOT EXISTS product_variants (
  id uuid PRIMARY KEY,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name text NOT NULL,
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  sku text,
  barcode text,
  image_url text,
  stock_quantity integer CHECK (stock_quantity IS NULL OR stock_quantity >= 0),
  available boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS product_variants_product_id_idx ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS product_variants_product_id_sort_idx ON product_variants(product_id, sort_order ASC, created_at ASC);

COMMENT ON TABLE product_variants IS 'Optional sellable SKUs per product. If a product has any rows here, checkout must reference product_variant_id.';
COMMENT ON COLUMN product_variants.stock_quantity IS 'Optional stock cap; NULL means unlimited (no server enforcement in v1).';

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_variant_id uuid REFERENCES product_variants(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS order_items_product_variant_id_idx ON order_items(product_variant_id);

ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS product_variant_id uuid REFERENCES product_variants(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS cart_items_session_product_variant_idx ON cart_items(session_id, product_id, product_variant_id);
