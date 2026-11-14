// Zoho Meeting API helpers — SERVER ONLY (imported by app/api routes).
// Adapted from zoho-meeting-reference.js. Next.js loads .env.local automatically.
//
// Required env vars (see .env.local.example):
//   ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN, ZOHO_MEETING_ZSOID
// Optional:
//   ZOHO_DC (default "in"), ZOHO_PRESENTER_ZUID (skips one API call per booking)

import { BOOKING } from "@/lib/bookingConfig";

const DC = process.env.ZOHO_DC || "in";
const ACCOUNTS_URL = `https://accounts.zoho.${DC}`;
const MEETING_URL = `https://meeting.zoho.${DC}/api/v2`;

export function isZohoConfigured() {
  return Boolean(
    process.env.ZOHO_CLIENT_ID &&
      process.env.ZOHO_CLIENT_SECRET &&
      process.env.ZOHO_REFRESH_TOKEN &&
      process.env.ZOHO_MEETING_ZSOID
  );
}

async function readJson(res) {
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok || json.error) {
    throw new Error(`Zoho HTTP ${res.status}: ${text.slice(0, 500)}`);
  }
  return json;
}

// ---- Access token (valid ~1 hour, cached per server instance) ----
let cachedToken = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;

  const res = await fetch(`${ACCOUNTS_URL}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: process.env.ZOHO_CLIENT_ID,
      client_secret: process.env.ZOHO_CLIENT_SECRET,
      refresh_token: process.env.ZOHO_REFRESH_TOKEN,
    }),
    cache: "no-store",
  });
  const json = await readJson(res);
  if (!json.access_token) throw new Error(`Zoho token refresh failed: ${JSON.stringify(json)}`);

  cachedToken = json.access_token;
  tokenExpiresAt = Date.now() + ((json.expires_in || 3600) - 60) * 1000;
  return cachedToken;
}

async function zoho(path, { method = "GET", body } = {}) {
  const token = await getAccessToken();
  const res = await fetch(`${MEETING_URL}${path}`, {
    method,
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      "Content-Type": "application/json;charset=UTF-8",
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  return readJson(res);
}

// ---- Presenter (meeting host) zuid, cached ----
let presenterZuid = process.env.ZOHO_PRESENTER_ZUID || null;

async function getPresenterZuid() {
  if (presenterZuid) return presenterZuid;
  const res = await zoho("/user.json");
  presenterZuid = res.userDetails?.zuid;
  if (!presenterZuid) throw new Error("Could not read zuid from Zoho /user.json");
  return presenterZuid;
}

// ---- Create meeting ----
// startTime format: "Nov 14, 2026 03:00 PM" (in `timezone`)
export async function createMeeting({ topic, agenda, startTime, durationMinutes = BOOKING.slotMinutes, participants = [] }) {
  const zuid = await getPresenterZuid();
  const res = await zoho(`/${process.env.ZOHO_MEETING_ZSOID}/sessions.json`, {
    method: "POST",
    body: {
      session: {
        topic,
        agenda,
        presenter: Number(zuid),
        startTime,
        duration: durationMinutes * 60 * 1000,
        timezone: BOOKING.zohoTimezone,
        participants: participants.map((email) => ({ email })), // Zoho emails invites to these
      },
    },
  });
  return res.session; // joinLink, startLink, meetingKey, pwd, ...
}

// ---- All upcoming meetings (paginated) ----
export async function listUpcomingMeetings() {
  const count = 100;
  const all = [];
  for (let index = 1; index <= 500; index += count) {
    const res = await zoho(
      `/${process.env.ZOHO_MEETING_ZSOID}/sessions.json?listtype=upcoming&index=${index}&count=${count}`
    );
    const page = res.session || [];
    all.push(...page);
    if (page.length < count) break;
  }
  return all;
}

// ---- Work out a meeting's [start, end) in UTC ms, from whatever fields Zoho returns ----
const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
const IST_ZONES = new Set(["Asia/Calcutta", "Asia/Kolkata"]);

function parseZohoStartTime(str, timezone) {
  const m = /^(\w{3})\s+(\d{1,2}),\s*(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(String(str || "").trim());
  if (!m || !(m[1] in MONTHS)) return null;
  if (timezone && !IST_ZONES.has(timezone)) return null; // only IST can be parsed safely here
  let h = Number(m[4]) % 12;
  if (m[6].toUpperCase() === "PM") h += 12;
  return Date.UTC(Number(m[3]), MONTHS[m[1]], Number(m[2]), h, Number(m[5])) - BOOKING.utcOffsetMinutes * 60000;
}

export function meetingRange(session) {
  const start =
    Number(session.startTimeMillisec || session.startTimeMillis || session.startTimeInMillis) ||
    parseZohoStartTime(session.startTime, session.timezone);
  if (!start) return null;

  let end = Number(session.endTimeMillisec || session.endTimeMillis || session.endTimeInMillis);
  if (!end) {
    const d = Number(session.duration);
    // Zoho returns duration in ms; treat small numbers as minutes just in case.
    const durMs = !d ? BOOKING.slotMinutes * 60000 : d <= 24 * 60 ? d * 60000 : d;
    end = start + durMs;
  }
  return { start, end };
}
