// Shared booking rules — used by both the booking UI and the API routes,
// so the browser and the server always agree on what a valid slot is.
// All calendar maths is done in IST (UTC+05:30, no daylight saving).

export const BOOKING = {
  title: "AcadTracker Walkthrough",
  slotMinutes: 30,
  tzLabel: "IST",
  tzName: "India Standard Time",
  zohoTimezone: "Asia/Calcutta",
  utcOffsetMinutes: 330,
  // Opening hours per weekday (0 = Sunday … 6 = Saturday) as [startHour, endHour] in IST.
  // null = closed. The last slot starts 30 minutes before endHour.
  hours: {
    0: null,
    1: [10, 18],
    2: [10, 18],
    3: [10, 18],
    4: [10, 18],
    5: [10, 18],
    6: [10, 18],
  },
  minNoticeMinutes: 120, // can't book a slot starting sooner than this
  maxDaysAhead: 60, // how far into the future people can book
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n) => String(n).padStart(2, "0");
const DAY_MS = 86400000;

export function toDateKey(y, m, d) {
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function parseDateKey(key) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key || "");
  if (!match) return null;
  const [y, m, d] = match.slice(1).map(Number);
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null;
  return { y, m, d, dow: check.getUTCDay() };
}

// Wall-clock parts of a UTC timestamp as seen in IST.
export function istParts(ms) {
  const t = new Date(ms + BOOKING.utcOffsetMinutes * 60000);
  return {
    y: t.getUTCFullYear(),
    m: t.getUTCMonth() + 1,
    d: t.getUTCDate(),
    h: t.getUTCHours(),
    min: t.getUTCMinutes(),
    dow: t.getUTCDay(),
  };
}

export function istToUtcMs(y, m, d, h, min) {
  return Date.UTC(y, m - 1, d, h, min) - BOOKING.utcOffsetMinutes * 60000;
}

export function todayKeyIST(now = Date.now()) {
  const p = istParts(now);
  return toDateKey(p.y, p.m, p.d);
}

export function formatTime12(h, min) {
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(min)} ${suffix}`;
}

function daysBetween(fromKey, toKey) {
  const a = parseDateKey(fromKey);
  const b = parseDateKey(toKey);
  return (Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / DAY_MS;
}

// Is this calendar day (IST) open for booking at all?
export function isBookableDay(key, now = Date.now()) {
  const p = parseDateKey(key);
  if (!p || !BOOKING.hours[p.dow]) return false;
  const diff = daysBetween(todayKeyIST(now), key);
  return diff >= 0 && diff <= BOOKING.maxDaysAhead;
}

// Every slot on a day per opening hours (ignores notice period and existing meetings).
export function slotsForDate(key) {
  const p = parseDateKey(key);
  const hours = p && BOOKING.hours[p.dow];
  if (!hours) return [];
  const [startH, endH] = hours;
  const slots = [];
  for (let mins = startH * 60; mins + BOOKING.slotMinutes <= endH * 60; mins += BOOKING.slotMinutes) {
    const h = Math.floor(mins / 60);
    const min = mins % 60;
    slots.push({ start: istToUtcMs(p.y, p.m, p.d, h, min), label: formatTime12(h, min) });
  }
  return slots;
}

// Slots on a day that are still in the future (respecting the notice period).
export function upcomingSlotsForDate(key, now = Date.now()) {
  if (!isBookableDay(key, now)) return [];
  const earliest = now + BOOKING.minNoticeMinutes * 60000;
  return slotsForDate(key).filter((s) => s.start >= earliest);
}

export function isValidSlotStart(ms, now = Date.now()) {
  if (!Number.isFinite(ms)) return false;
  const p = istParts(ms);
  const key = toDateKey(p.y, p.m, p.d);
  return upcomingSlotsForDate(key, now).some((s) => s.start === ms);
}

// Format Zoho Meeting expects, e.g. "Nov 14, 2026 03:00 PM" (in IST).
export function zohoStartTime(ms) {
  const p = istParts(ms);
  const h12 = p.h % 12 === 0 ? 12 : p.h % 12;
  return `${MONTHS[p.m - 1]} ${pad(p.d)}, ${p.y} ${pad(h12)}:${pad(p.min)} ${p.h >= 12 ? "PM" : "AM"}`;
}

// Human label, e.g. "Monday, 16 November 2026, 3:00 PM – 3:30 PM IST".
export function humanSlotLabel(ms) {
  const p = istParts(ms);
  const e = istParts(ms + BOOKING.slotMinutes * 60000);
  const dayName = new Date(Date.UTC(p.y, p.m - 1, p.d)).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return `${dayName}, ${formatTime12(p.h, p.min)} – ${formatTime12(e.h, e.min)} ${BOOKING.tzLabel}`;
}
