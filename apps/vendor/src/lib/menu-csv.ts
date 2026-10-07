/** Max rows accepted per bulk menu import (must match server). */
export const MENU_CSV_MAX_ROWS = 500;

export const MENU_CSV_TEMPLATE = `name,price_cents,category,description,available,image_url,dietary_tags,barcode,sku,variant_name,variant_price_cents,variant_barcode,variant_sku,variant_stock,variant_available
Margherita Pizza,1295,Mains,Classic tomato and mozzarella,true,,,,,Large,1395,,,,true
Iced Tea,350,Drinks,House blend,true,,,,,,,,,,
Combo Plate,15.99,Specials,"Meal deal, includes side",yes,,gluten_free,,,Standard,15.99,,,,yes`;

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, "_");
}

/**
 * RFC 4180–style CSV parse: commas, quoted fields, doubled quotes, \n / \r\n.
 */
export function parseCsvToMatrix(text: string): string[][] {
  const s = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  const pushCell = () => {
    row.push(cell);
    cell = "";
  };

  const pushRow = () => {
    pushCell();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      pushCell();
    } else if (c === "\r") {
      /* skip */
    } else if (c === "\n") {
      pushRow();
    } else {
      cell += c;
    }
  }
  pushCell();
  const last = row;
  const hasContent = last.some((x) => x.length > 0);
  if (hasContent) rows.push(last);

  while (rows.length && rows[rows.length - 1].every((c) => c.trim() === "")) {
    rows.pop();
  }

  return rows;
}

function getField(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== "") return v;
  }
  return "";
}

function parseAvailable(raw: string): boolean {
  const v = raw.trim().toLowerCase();
  if (!v) return true;
  return v === "true" || v === "1" || v === "yes" || v === "y";
}

function parseDietaryTags(raw: string): string[] {
  if (!raw.trim()) return [];
  return raw
    .split(/[|;]/g)
    .map((t) => t.trim().toLowerCase().replace(/\s+/g, "_"))
    .filter(Boolean);
}

function parsePriceCents(row: Record<string, string>, excelRow: number): { ok: true; cents: number } | { ok: false; message: string } {
  const centsStr = getField(row, "price_cents", "pricecents");
  const priceStr = getField(row, "price");

  if (centsStr) {
    const n = Number.parseInt(centsStr.replace(/[^\d-]/g, ""), 10);
    if (!Number.isFinite(n) || n < 0) {
      return { ok: false, message: `Row ${excelRow}: price_cents must be a non-negative integer` };
    }
    return { ok: true, cents: n };
  }

  if (priceStr) {
    const n = Number.parseFloat(priceStr.replace(/,/g, ""));
    if (!Number.isFinite(n) || n < 0) {
      return { ok: false, message: `Row ${excelRow}: price must be a valid non-negative number` };
    }
    return { ok: true, cents: Math.round(n * 100) };
  }

  return { ok: false, message: `Row ${excelRow}: missing price (set price_cents or price)` };
}

function parseVariantPriceCents(
  row: Record<string, string>,
  excelRow: number
): { ok: true; cents: number } | { ok: false; message: string } {
  const centsStr = getField(row, "variant_price_cents", "variantpricecents");
  const priceStr = getField(row, "variant_price", "variantprice");
  if (centsStr) {
    const n = Number.parseInt(centsStr.replace(/[^\d-]/g, ""), 10);
    if (!Number.isFinite(n) || n < 0) {
      return { ok: false, message: `Row ${excelRow}: variant_price_cents must be a non-negative integer` };
    }
    return { ok: true, cents: n };
  }
  if (priceStr) {
    const n = Number.parseFloat(priceStr.replace(/,/g, ""));
    if (!Number.isFinite(n) || n < 0) {
      return { ok: false, message: `Row ${excelRow}: variant_price must be a valid non-negative number` };
    }
    return { ok: true, cents: Math.round(n * 100) };
  }
  return { ok: false, message: `Row ${excelRow}: variant_name requires variant_price_cents or variant_price` };
}

export type ParsedMenuProductInitialVariant = {
  name: string;
  priceCents: number;
  sku: string | null;
  barcode: string | null;
  stockQuantity: number | null;
  available: boolean;
};

export type ParsedMenuProduct = {
  name: string;
  priceCents: number;
  category: string | null;
  description: string | null;
  imageUrl: string | null;
  available: boolean;
  dietaryTags: string[];
  barcode: string | null;
  sku: string | null;
  /** When set, bulk import creates this variant after the product row. */
  initialVariant?: ParsedMenuProductInitialVariant;
};

export type ParseMenuCsvResult =
  | { ok: true; items: ParsedMenuProduct[] }
  | { ok: false; errors: Array<{ row: number; message: string }> };

/**
 * @param text - raw CSV (UTF-8)
 * @param excelHeaderRow - 1-based row number of the header (for error messages)
 */
export function parseMenuCsv(text: string, excelHeaderRow = 1): ParseMenuCsvResult {
  const matrix = parseCsvToMatrix(text);
  if (matrix.length < 2) {
    return {
      ok: false,
      errors: [{ row: excelHeaderRow, message: "CSV needs a header row and at least one product row" }],
    };
  }

  const headerCells = matrix[0].map(normalizeHeader);
  const headers = headerCells.map((h, i) => h || `_empty_${i}`);

  const nameIdx = headers.indexOf("name");
  if (nameIdx < 0) {
    return {
      ok: false,
      errors: [{ row: excelHeaderRow, message: 'Missing required column "name"' }],
    };
  }

  const hasPrice = headers.includes("price_cents") || headers.includes("pricecents") || headers.includes("price");
  if (!hasPrice) {
    return {
      ok: false,
      errors: [{ row: excelHeaderRow, message: 'Missing price column: add "price_cents" (integer) or "price" (decimal, e.g. 9.99)' }],
    };
  }

  const items: ParsedMenuProduct[] = [];
  const errors: Array<{ row: number; message: string }> = [];

  for (let i = 1; i < matrix.length; i++) {
    const excelRow = excelHeaderRow + i;
    const cells = matrix[i];
    const row: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      row[headers[c]] = cells[c] ?? "";
    }

    const name = getField(row, "name").trim();
    if (!name) {
      const allEmpty = cells.every((x) => !String(x).trim());
      if (allEmpty) continue;
      errors.push({ row: excelRow, message: "Product name is required" });
      continue;
    }

    const price = parsePriceCents(row, excelRow);
    if (!price.ok) {
      errors.push({ row: excelRow, message: price.message });
      continue;
    }

    if (price.cents > 10_000_00) {
      errors.push({ row: excelRow, message: "price exceeds maximum (100,000.00)" });
      continue;
    }

    const categoryRaw = getField(row, "category").trim();
    const descriptionRaw = getField(row, "description").trim();
    const imageRaw = getField(row, "image_url", "imageurl").trim();
    const dietaryRaw = getField(row, "dietary_tags", "dietarytags", "tags").trim();
    const barcodeRaw = getField(row, "barcode", "upc", "ean").trim();
    const skuRaw = getField(row, "sku", "stock_keeping_unit").trim();

    if (barcodeRaw.length > 64) {
      errors.push({ row: excelRow, message: "barcode must be at most 64 characters" });
      continue;
    }
    if (skuRaw.length > 64) {
      errors.push({ row: excelRow, message: "sku must be at most 64 characters" });
      continue;
    }

    if (imageRaw) {
      try {
        const u = new URL(imageRaw);
        if (!/^https?:$/i.test(u.protocol)) {
          errors.push({ row: excelRow, message: "image_url must be http(s)" });
          continue;
        }
      } catch {
        errors.push({ row: excelRow, message: "image_url is not a valid URL" });
        continue;
      }
    }

    const variantName = getField(row, "variant_name", "variantname").trim();
    const variantBarcodeRaw = getField(row, "variant_barcode", "variantbarcode").trim();
    const variantSkuRaw = getField(row, "variant_sku", "variantsku").trim();
    const variantStockRaw = getField(row, "variant_stock", "variantstock").trim();

    if (variantBarcodeRaw.length > 64) {
      errors.push({ row: excelRow, message: "variant_barcode must be at most 64 characters" });
      continue;
    }
    if (variantSkuRaw.length > 64) {
      errors.push({ row: excelRow, message: "variant_sku must be at most 64 characters" });
      continue;
    }

    let initialVariant: ParsedMenuProduct["initialVariant"];
    if (variantName) {
      const vp = parseVariantPriceCents(row, excelRow);
      if (!vp.ok) {
        errors.push({ row: excelRow, message: vp.message });
        continue;
      }
      if (vp.cents > 10_000_00) {
        errors.push({ row: excelRow, message: "variant price exceeds maximum (100,000.00)" });
        continue;
      }
      let stockQuantity: number | null = null;
      if (variantStockRaw.trim()) {
        const n = Math.floor(Number(variantStockRaw));
        if (!Number.isFinite(n) || n < 0) {
          errors.push({ row: excelRow, message: "variant_stock must be a non-negative integer" });
          continue;
        }
        stockQuantity = n;
      }
      initialVariant = {
        name: variantName,
        priceCents: vp.cents,
        sku: variantSkuRaw ? variantSkuRaw : null,
        barcode: variantBarcodeRaw ? variantBarcodeRaw : null,
        stockQuantity,
        available: parseAvailable(getField(row, "variant_available", "variantavailable")),
      };
    } else {
      const hasVariantPrice =
        getField(row, "variant_price_cents", "variantpricecents").trim() ||
        getField(row, "variant_price", "variantprice").trim();
      if (hasVariantPrice) {
        errors.push({
          row: excelRow,
          message:
            "variant price columns require variant_name — set variant_name or clear variant price columns",
        });
        continue;
      }
    }

    items.push({
      name,
      priceCents: price.cents,
      category: categoryRaw ? categoryRaw : null,
      description: descriptionRaw ? descriptionRaw : null,
      imageUrl: imageRaw ? imageRaw : null,
      available: parseAvailable(getField(row, "available")),
      dietaryTags: parseDietaryTags(dietaryRaw),
      barcode: barcodeRaw ? barcodeRaw : null,
      sku: skuRaw ? skuRaw : null,
      ...(initialVariant ? { initialVariant } : {}),
    });
  }

  if (errors.length) return { ok: false, errors };

  if (items.length === 0) {
    return { ok: false, errors: [{ row: excelHeaderRow + 1, message: "No product rows found" }] };
  }

  if (items.length > MENU_CSV_MAX_ROWS) {
    return {
      ok: false,
      errors: [{ row: excelHeaderRow, message: `Too many rows (${items.length}). Maximum is ${MENU_CSV_MAX_ROWS}.` }],
    };
  }

  return { ok: true, items };
}

export function downloadMenuCsvTemplate() {
  const blob = new Blob([MENU_CSV_TEMPLATE], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "dilivygo-menu-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}
