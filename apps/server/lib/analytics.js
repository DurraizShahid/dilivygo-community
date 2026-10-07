'use strict';

const ANALYTICS_RANGE_DAYS = [7, 14, 30, 90];

function parseRangeDays(value, fallback = 30) {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  return ANALYTICS_RANGE_DAYS.includes(parsed) ? parsed : fallback;
}

function getRangeBounds(rangeDays) {
  const end = new Date();
  end.setUTCHours(23, 59, 59, 999);

  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - rangeDays + 1);
  start.setUTCHours(0, 0, 0, 0);

  const previousStart = new Date(start);
  previousStart.setUTCDate(previousStart.getUTCDate() - rangeDays);

  const previousEnd = new Date(start.getTime() - 1);

  return { start, end, previousStart, previousEnd };
}

function toDayKey(dateLike) {
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function toHourLabel(dateLike) {
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return null;
  return `${String(d.getUTCHours()).padStart(2, '0')}:00`;
}

function buildDaySeries(start, end, initialFactory) {
  const series = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    const key = toDayKey(cursor);
    series.push({ date: key, ...initialFactory() });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return series;
}

function pctChange(current, previous) {
  if (!previous) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

function round(value, digits = 1) {
  const p = 10 ** digits;
  return Math.round(value * p) / p;
}

module.exports = {
  ANALYTICS_RANGE_DAYS,
  parseRangeDays,
  getRangeBounds,
  toDayKey,
  toHourLabel,
  buildDaySeries,
  pctChange,
  round,
};
