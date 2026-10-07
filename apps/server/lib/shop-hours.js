'use strict';

const VALID_DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** Map Intl / locale weekday tokens to our OperatingHours keys (mon..sun). */
function normalizeWeekdayToken(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const v = raw.toLowerCase().replace(/\./g, '').trim();
  const aliases = {
    sun: 'sun',
    sunday: 'sun',
    mon: 'mon',
    monday: 'mon',
    tue: 'tue',
    tues: 'tue',
    tuesday: 'tue',
    wed: 'wed',
    weds: 'wed',
    wednesday: 'wed',
    thu: 'thu',
    thur: 'thu',
    thurs: 'thu',
    thursday: 'thu',
    fri: 'fri',
    friday: 'fri',
    sat: 'sat',
    saturday: 'sat',
  };
  if (aliases[v]) return aliases[v];
  const prefix3 = v.slice(0, 3);
  if (VALID_DAY_KEYS.includes(prefix3)) return prefix3;
  return null;
}

function parseTimeToMinutes(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  const m = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(trimmed);
  if (!m) return null;
  return (Number(m[1]) * 60) + Number(m[2]);
}

function normalizeOperatingHours(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return raw;
}

function resolveShopTimezone(timezone) {
  if (!timezone || typeof timezone !== 'string') return 'UTC';
  const tz = timezone.trim();
  if (!tz) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
    return tz;
  } catch {
    return 'UTC';
  }
}

function getWeekdayAndMinutes(date, timezone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const weekdayRaw = parts.find((p) => p.type === 'weekday')?.value || '';
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 'NaN');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 'NaN');
  const weekday = normalizeWeekdayToken(weekdayRaw) || 'sun';
  const minutesOfDay = Number.isFinite(hour) && Number.isFinite(minute)
    ? (hour * 60) + minute
    : 0;
  return { weekday, minutesOfDay };
}

function rangesForShopDay(hours, weekdayKey) {
  if (!hours || typeof hours !== 'object' || Array.isArray(hours)) return [];
  const direct = hours[weekdayKey];
  if (Array.isArray(direct)) return direct;
  const match = Object.keys(hours).find((k) => k.toLowerCase() === weekdayKey);
  return Array.isArray(match ? hours[match] : null) ? hours[match] : [];
}

function previousDayKey(weekdayKey) {
  const idx = VALID_DAY_KEYS.indexOf(weekdayKey);
  if (idx < 0) return 'sat';
  return VALID_DAY_KEYS[(idx + VALID_DAY_KEYS.length - 1) % VALID_DAY_KEYS.length];
}

function isOpenInCurrentDayRanges(minutesOfDay, ranges) {
  for (const range of ranges) {
    const start = parseTimeToMinutes(range?.start);
    const end = parseTimeToMinutes(range?.end);
    if (start == null || end == null || start === end) continue;

    if (start < end) {
      if (minutesOfDay >= start && minutesOfDay <= end) return true;
      continue;
    }

    // Overnight range belongs to the configured day only from its start until
    // midnight. The after-midnight segment is evaluated against the PREVIOUS
    // day's ranges by `isOpenFromPreviousOvernightRange` below.
    if (minutesOfDay >= start) return true;
  }
  return false;
}

function isOpenFromPreviousOvernightRange(minutesOfDay, ranges) {
  for (const range of ranges) {
    const start = parseTimeToMinutes(range?.start);
    const end = parseTimeToMinutes(range?.end);
    if (start == null || end == null || start <= end) continue;
    if (minutesOfDay < end) return true;
  }
  return false;
}

function getShopOpenState(shop, at = new Date()) {
  const tz = resolveShopTimezone(shop?.timezone);
  const hours = normalizeOperatingHours(shop?.operating_hours ?? shop?.operatingHours);
  if (!hours) {
    return { isOpen: true, timezone: tz };
  }

  const { weekday, minutesOfDay } = getWeekdayAndMinutes(at, tz);
  const dayRanges = rangesForShopDay(hours, weekday);
  const previousRanges = rangesForShopDay(hours, previousDayKey(weekday));
  const isOpen =
    isOpenInCurrentDayRanges(minutesOfDay, dayRanges) ||
    isOpenFromPreviousOvernightRange(minutesOfDay, previousRanges);

  return { isOpen, timezone: tz };
}

module.exports = {
  getShopOpenState,
  resolveShopTimezone,
  parseTimeToMinutes,
  previousDayKey,
};
