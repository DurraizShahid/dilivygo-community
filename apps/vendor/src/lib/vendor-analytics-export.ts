import { buildDilivygoDonutSvgMarkup, dilivygoChartColorAt, formatPrice } from "@dilivygo/ui";
import type {
  ShopReview,
  ShopReviewSummary,
  VendorAnalyticsResponse,
} from "@dilivygo/types";

const SPARK_CHARS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"] as const;

function csvCell(value: unknown): string {
  if (value == null) return '""';
  const s = String(value).replace(/\r\n|\r|\n/g, " ").replace(/"/g, '""');
  return `"${s}"`;
}

function row(...cells: unknown[]): string {
  return cells.map(csvCell).join(",");
}

export function unicodeSparkline(values: number[]): string {
  if (!values.length) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values
    .map((v) => {
      const t = (v - min) / range;
      const idx = Math.min(7, Math.max(0, Math.round(t * 7)));
      return SPARK_CHARS[idx];
    })
    .join("");
}

export function unicodeBar(value: number, max: number, width = 18): string {
  if (max <= 0 || !Number.isFinite(max)) return "░".repeat(width);
  const filled = Math.min(width, Math.max(0, Math.round((value / max) * width)));
  return "█".repeat(filled) + "░".repeat(width - filled);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function downloadBlob(blob: Blob, filename: string) {
  if (typeof window === "undefined") return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export type VendorAnalyticsExportContext = {
  analytics: VendorAnalyticsResponse;
  currencyCode: string;
  workspaceName: string;
  shopLabel: string;
  generatedAt: Date;
  reviews?: { reviews: ShopReview[]; summary: ShopReviewSummary } | null;
};

function humanStatus(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildCsvLines(ctx: VendorAnalyticsExportContext): string[] {
  const { analytics: d, currencyCode, workspaceName, shopLabel, generatedAt, reviews } = ctx;
  const lines: string[] = [];
  const fmt = (cents: number) => formatPrice(cents, currencyCode);
  const stamp = generatedAt.toISOString();

  const ordersSeries = d.series.ordersByDay.map((p) => p.orders ?? 0);
  const revenueSeries = d.series.ordersByDay.map((p) => p.revenueCents ?? 0);
  const maxPeak = Math.max(0, ...d.series.peakHours.map((p) => p.orders ?? 0));
  const totalStatus = d.series.statusBreakdown.reduce((s, x) => s + x.count, 0) || 1;
  const maxPopularQty = Math.max(0, ...d.series.popularItems.map((p) => p.quantity));

  lines.push(row("Dilivygo — Vendor analytics export"));
  lines.push(row("Generated (UTC)", stamp));
  lines.push(row("Workspace", workspaceName));
  lines.push(row("Shop scope", shopLabel));
  lines.push(row("Range (days)", d.rangeDays));
  lines.push("");
  lines.push(row(`✦ PERFORMANCE SNAPSHOT — last ${d.rangeDays} days`));
  lines.push(row("Metric", "Value", "Notes"));
  lines.push(
    row(
      "Total orders",
      d.summary.totalOrders,
      `${d.summary.orderTrendPct >= 0 ? "+" : ""}${d.summary.orderTrendPct}% vs previous period`
    )
  );
  lines.push(
    row(
      "Total revenue",
      fmt(d.summary.totalRevenueCents),
      `${d.summary.revenueTrendPct >= 0 ? "+" : ""}${d.summary.revenueTrendPct}% vs previous period`
    )
  );
  lines.push(row("Completed orders", d.summary.completedOrders));
  lines.push(row("Completion rate", `${d.summary.completionRate}%`));
  lines.push(row("Average order value", fmt(d.summary.averageOrderValueCents)));
  lines.push(row("Average prep time", `${d.summary.averagePrepMinutes} minutes`));
  lines.push("");
  lines.push(row("✦ DAILY ORDERS & REVENUE"));
  lines.push(row("Date", "Orders", "Revenue (cents)", "Revenue (display)", "Weekday"));
  for (const p of d.series.ordersByDay) {
    const date = new Date(p.date);
    const wd = Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(undefined, { weekday: "short" });
    lines.push(
      row(
        p.date,
        p.orders ?? 0,
        p.revenueCents ?? 0,
        fmt(p.revenueCents ?? 0),
        wd
      )
    );
  }
  lines.push("");
  lines.push(row("Visual (Unicode) — full-period sparklines"));
  lines.push(row("Orders trend", unicodeSparkline(ordersSeries)));
  lines.push(row("Revenue trend (scaled)", unicodeSparkline(revenueSeries)));
  lines.push("");
  lines.push(row("✦ PEAK HOURS (order volume)"));
  lines.push(row("Hour", "Orders", "Bar (max in range)", "Share of peak"));
  for (const p of d.series.peakHours) {
    const o = p.orders ?? 0;
    const share = maxPeak > 0 ? `${((o / maxPeak) * 100).toFixed(0)}% of peak hour` : "";
    lines.push(row(p.hour, o, unicodeBar(o, maxPeak, 20), share));
  }
  lines.push("");
  lines.push(row("✦ ORDER STATUS MIX"));
  lines.push(row("Status", "Count", "Percent", "Distribution bar"));
  for (const p of d.series.statusBreakdown) {
    const pct = ((p.count / totalStatus) * 100).toFixed(1) + "%";
    lines.push(row(humanStatus(p.status), p.count, pct, unicodeBar(p.count, totalStatus, 22)));
  }
  lines.push("");
  lines.push(row("✦ POPULAR ITEMS"));
  lines.push(row("Rank", "Item name", "Qty sold", "Revenue (cents)", "Revenue", "Volume bar"));
  d.series.popularItems.forEach((item, i) => {
    lines.push(
      row(
        i + 1,
        item.name,
        item.quantity,
        item.revenueCents,
        fmt(item.revenueCents),
        unicodeBar(item.quantity, maxPopularQty || 1, 16)
      )
    );
  });
  if (!d.series.popularItems.length) {
    lines.push(row("—", "No line items in range", "", "", "", ""));
  }

  lines.push("");
  lines.push(row("✦ REVIEWS"));
  if (reviews?.summary) {
    lines.push(
      row(
        "Summary average rating",
        reviews.summary.averageRating.toFixed(2),
        `from ${reviews.summary.reviewCount} review(s)`
      )
    );
    lines.push(row("Review ID", "Rating", "Created (UTC)", "Moderation", "Comment preview"));
    const list = reviews.reviews ?? [];
    if (!list.length) {
      lines.push(row("—", "No reviews loaded", "", "", ""));
    } else {
      for (const r of list) {
        const comment = (r.comment || "").slice(0, 280);
        lines.push(
          row(r.id, r.rating, r.createdAt, r.moderationStatus, comment)
        );
      }
    }
  } else {
    lines.push(row("—", "No shop selected or reviews not included", "", "", ""));
  }

  lines.push("");
  lines.push(row("— End of report — Dilivygo"));
  return lines;
}

export function downloadVendorAnalyticsCsv(ctx: VendorAnalyticsExportContext, filename: string) {
  const body = "\uFEFF" + buildCsvLines(ctx).join("\n");
  downloadBlob(new Blob([body], { type: "text/csv;charset=utf-8" }), filename);
}

function svgPolylineNormalized(
  values: number[],
  width: number,
  height: number,
  pad: number,
  color: string,
  fill?: string
): string {
  if (!values.length) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const innerW = width - 2 * pad;
  const innerH = height - 2 * pad;
  const baseY = pad + innerH;
  const pts = values.map((v, i) => {
    const x = pad + (values.length <= 1 ? innerW / 2 : (i / (values.length - 1)) * innerW);
    const y = pad + innerH - ((v - min) / range) * innerH;
    return { x: x.toFixed(1), y: y.toFixed(1) };
  });
  const lineD =
    `M ${pts[0].x} ${pts[0].y}` + pts.slice(1).map((p) => ` L ${p.x} ${p.y}`).join("");
  if (fill) {
    const last = pts[pts.length - 1];
    const first = pts[0];
    const areaD = `${lineD} L ${last.x} ${baseY.toFixed(1)} L ${first.x} ${baseY.toFixed(1)} Z`;
    return `<path d="${areaD}" fill="${fill}" opacity="0.35"/><path d="${lineD}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  return `<path d="${lineD}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function statusBreakdownLegend(breakdown: { status: string; count: number }[]): string {
  const rows = breakdown.filter((x) => x.count > 0);
  if (!rows.length) {
    return `<span class="lg" style="color:var(--muted)">No status rows in range</span>`;
  }
  return rows
    .map((x, i) => {
      const color = dilivygoChartColorAt(i);
      return `<span class="lg"><i style="background:${color}"></i>${escapeHtml(humanStatus(x.status))} · ${x.count}</span>`;
    })
    .join("");
}

function statusDonutBlock(breakdown: { status: string; count: number }[]): string {
  const total = breakdown.reduce((s, x) => s + x.count, 0);
  if (total === 0) {
    return `<div class="donut-wrap donut-wrap--empty" role="img" aria-label="No status data"><span class="donut-empty-label">No data in range</span></div>`;
  }
  const segments = breakdown
    .filter((x) => x.count > 0)
    .map((x, i) => ({
      key: x.status,
      value: x.count,
      color: dilivygoChartColorAt(i),
    }));
  const svg = buildDilivygoDonutSvgMarkup({
    segments,
    size: 176,
    thicknessRatio: 0.34,
    gapDegrees: 3.25,
    radiusRatio: 0.68,
    trackColor: "rgba(148,163,184,0.32)",
  });
  return `<div class="donut-wrap">${svg}<div class="donut-center-label" aria-hidden="true"><strong>${total}</strong><small>orders</small></div></div>`;
}

export function buildVendorAnalyticsHtmlReport(ctx: VendorAnalyticsExportContext): string {
  const { analytics: d, currencyCode, workspaceName, shopLabel, generatedAt, reviews } = ctx;
  const fmt = (cents: number) => formatPrice(cents, currencyCode);
  const ordersVals = d.series.ordersByDay.map((p) => p.orders ?? 0);
  const revenueVals = d.series.ordersByDay.map((p) => p.revenueCents ?? 0);
  const maxPeak = Math.max(0, ...d.series.peakHours.map((p) => p.orders ?? 0)) || 1;
  const legend = statusBreakdownLegend(d.series.statusBreakdown);
  const donutBlock = statusDonutBlock(d.series.statusBreakdown);

  const orderSvg = svgPolylineNormalized(ordersVals, 640, 200, 16, "#a78bfa", "#8b5cf633");
  const revenueSvg = svgPolylineNormalized(revenueVals, 640, 200, 16, "#2dd4bf", "#14b8a644");

  const peakBars = d.series.peakHours
    .map((p) => {
      const h = ((p.orders ?? 0) / maxPeak) * 100;
      return `<div class="bar-wrap" title="${escapeHtml(p.hour)}: ${p.orders ?? 0} orders"><div class="bar" style="height:${h}%"></div><span>${escapeHtml(p.hour)}</span></div>`;
    })
    .join("");

  const popularRows = d.series.popularItems
    .slice(0, 12)
    .map(
      (item, i) =>
        `<tr><td>${i + 1}</td><td>${escapeHtml(item.name)}</td><td class="num">${item.quantity}</td><td class="num">${escapeHtml(fmt(item.revenueCents))}</td></tr>`
    )
    .join("");

  const reviewRows =
    reviews?.reviews
      ?.map(
        (r) =>
          `<tr><td>${escapeHtml(r.id.slice(0, 8))}…</td><td class="num">${r.rating}</td><td>${escapeHtml(r.createdAt)}</td><td>${escapeHtml(r.moderationStatus)}</td><td>${escapeHtml((r.comment || "—").slice(0, 120))}</td></tr>`
      )
      .join("") || "";

  const sparkOrders = escapeHtml(unicodeSparkline(ordersVals));
  const sparkRev = escapeHtml(unicodeSparkline(revenueVals));

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Dilivygo · Vendor analytics — ${escapeHtml(shopLabel)}</title>
<style>
  :root {
    --bg: #0b1220;
    --card: #111827;
    --border: rgba(148,163,184,0.2);
    --text: #e2e8f0;
    --muted: #94a3b8;
    --accent: #14b8a6;
    --violet: #8b5cf6;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    background: radial-gradient(1200px 600px at 10% -10%, rgba(20,184,166,0.18), transparent),
                radial-gradient(900px 500px at 100% 0%, rgba(139,92,246,0.15), transparent),
                var(--bg);
    color: var(--text);
    line-height: 1.5;
    padding: 32px 20px 48px;
  }
  .wrap { max-width: 1100px; margin: 0 auto; }
  header {
    padding: 28px 32px;
    border-radius: 20px;
    background: linear-gradient(135deg, rgba(17,24,39,0.95), rgba(15,23,42,0.85));
    border: 1px solid var(--border);
    box-shadow: 0 25px 50px -12px rgba(0,0,0,0.45);
    margin-bottom: 28px;
  }
  h1 {
    margin: 0 0 8px;
    font-size: 1.75rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    background: linear-gradient(90deg, #5eead4, #a78bfa);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  .meta { color: var(--muted); font-size: 0.875rem; }
  .kpis {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 14px;
    margin-bottom: 22px;
  }
  .kpi {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 18px 20px;
  }
  .kpi label { display: block; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin-bottom: 6px; }
  .kpi strong { font-size: 1.35rem; font-weight: 700; }
  .kpi small { display: block; margin-top: 6px; color: var(--muted); font-size: 0.8rem; }
  .grid2 {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 18px;
    margin-bottom: 18px;
  }
  .card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 18px;
    padding: 20px 22px 16px;
  }
  .card h2 {
    margin: 0 0 14px;
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--muted);
    letter-spacing: 0.02em;
  }
  svg { display: block; width: 100%; height: auto; }
  .spark {
    font-family: ui-monospace, monospace;
    font-size: 1.1rem;
    letter-spacing: 0.02em;
    color: #cbd5e1;
    margin-top: 10px;
    word-break: break-all;
  }
  .peak {
    display: flex;
    align-items: flex-end;
    gap: 4px;
    height: 160px;
    padding: 8px 4px 0;
    margin-top: 8px;
  }
  .bar-wrap {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    height: 100%;
    min-width: 0;
  }
  .bar-wrap span { font-size: 9px; color: var(--muted); margin-top: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
  .bar {
    width: 100%;
    max-width: 14px;
    margin: 0 auto;
    background: linear-gradient(180deg, #3b82f6, #1d4ed8);
    border-radius: 6px 6px 2px 2px;
    min-height: 2px;
    flex: 1;
    align-self: flex-end;
  }
  .donut-row { display: flex; flex-wrap: wrap; align-items: center; gap: 28px; }
  .donut-wrap {
    position: relative;
    width: 176px;
    height: 176px;
    flex-shrink: 0;
  }
  .donut-wrap svg { display: block; width: 100%; height: auto; }
  .donut-center-label {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    text-align: center;
  }
  .donut-center-label strong { font-size: 1.55rem; font-weight: 600; letter-spacing: -0.02em; color: var(--text); line-height: 1.1; }
  .donut-center-label small { font-size: 0.6rem; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); margin-top: 3px; }
  .donut-wrap--empty {
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    border: 1px dashed var(--border);
    color: var(--muted);
    font-size: 0.8rem;
  }
  .legend { display: flex; flex-direction: column; gap: 8px; font-size: 0.85rem; }
  .lg { display: flex; align-items: center; gap: 8px; color: var(--text); }
  .lg i { width: 10px; height: 10px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
  table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
  th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid var(--border); }
  th { color: var(--muted); font-weight: 500; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.06em; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  footer { margin-top: 32px; text-align: center; color: var(--muted); font-size: 0.8rem; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>Analytics report</h1>
    <p class="meta">${escapeHtml(workspaceName)} · ${escapeHtml(shopLabel)} · Last <strong>${d.rangeDays}</strong> days · Generated ${escapeHtml(generatedAt.toISOString())}</p>
  </header>

  <div class="kpis">
    <div class="kpi"><label>Orders</label><strong>${d.summary.totalOrders}</strong><small>${d.summary.orderTrendPct >= 0 ? "+" : ""}${d.summary.orderTrendPct}% vs prior period</small></div>
    <div class="kpi"><label>Revenue</label><strong>${escapeHtml(fmt(d.summary.totalRevenueCents))}</strong><small>${d.summary.revenueTrendPct >= 0 ? "+" : ""}${d.summary.revenueTrendPct}% vs prior period</small></div>
    <div class="kpi"><label>Completion</label><strong>${d.summary.completionRate}%</strong><small>${d.summary.completedOrders} completed orders</small></div>
    <div class="kpi"><label>Avg prep</label><strong>${d.summary.averagePrepMinutes} min</strong><small>AOV ${escapeHtml(fmt(d.summary.averageOrderValueCents))}</small></div>
  </div>

  <div class="grid2">
    <div class="card">
      <h2>Order volume</h2>
      <svg viewBox="0 0 640 200" xmlns="http://www.w3.org/2000/svg">${orderSvg}</svg>
      <div class="spark" aria-hidden="true">${sparkOrders}</div>
    </div>
    <div class="card">
      <h2>Revenue</h2>
      <svg viewBox="0 0 640 200" xmlns="http://www.w3.org/2000/svg">${revenueSvg}</svg>
      <div class="spark" aria-hidden="true">${sparkRev}</div>
    </div>
  </div>

  <div class="card" style="margin-bottom:18px">
    <h2>Peak hours</h2>
    <div class="peak">${peakBars}</div>
  </div>

  <div class="grid2">
    <div class="card">
      <h2>Popular items</h2>
      <table>
        <thead><tr><th>#</th><th>Item</th><th class="num">Qty</th><th class="num">Revenue</th></tr></thead>
        <tbody>${popularRows || `<tr><td colspan="4" style="color:var(--muted)">No items in range</td></tr>`}</tbody>
      </table>
    </div>
    <div class="card">
      <h2>Order status mix</h2>
      <div class="donut-row">
        ${donutBlock}
        <div class="legend">${legend}</div>
      </div>
    </div>
  </div>

  <div class="card">
    <h2>Reviews ${reviews?.summary ? `· ★ ${reviews.summary.averageRating.toFixed(1)} (${reviews.summary.reviewCount})` : ""}</h2>
    <table>
      <thead><tr><th>ID</th><th class="num">Rating</th><th>Created</th><th>Status</th><th>Comment</th></tr></thead>
      <tbody>${reviewRows || `<tr><td colspan="5" style="color:var(--muted)">No review rows exported</td></tr>`}</tbody>
    </table>
  </div>

  <footer>Dilivygo vendor analytics · ${escapeHtml(currencyCode.toUpperCase())} · Open in any browser · Data snapshot is static</footer>
</div>
</body>
</html>`;
}

export function downloadVendorAnalyticsHtml(ctx: VendorAnalyticsExportContext, filename: string) {
  const html = buildVendorAnalyticsHtmlReport(ctx);
  downloadBlob(new Blob([html], { type: "text/html;charset=utf-8" }), filename);
}
