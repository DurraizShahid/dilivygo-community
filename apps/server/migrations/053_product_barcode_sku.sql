-- Optional POS / inventory codes per product (scoped by shop).

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS barcode text,
  ADD COLUMN IF NOT EXISTS sku text;

COMMENT ON COLUMN products.barcode IS 'Scannable code (UPC/EAN/etc.); unique per shop when set; omitted from public menu API.';
COMMENT ON COLUMN products.sku IS 'Internal stock-keeping code; unique per shop when set; omitted from public menu API.';

CREATE UNIQUE INDEX IF NOT EXISTS products_shop_barcode_lower_uq
  ON products (shop_id, lower(trim(barcode)))
  WHERE barcode IS NOT NULL AND length(trim(barcode)) > 0;

CREATE UNIQUE INDEX IF NOT EXISTS products_shop_sku_lower_uq
  ON products (shop_id, lower(trim(sku)))
  WHERE sku IS NOT NULL AND length(trim(sku)) > 0;
