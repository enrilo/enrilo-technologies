// Busy-time lookup against Zoho Meeting — SERVER ONLY.
import { BOOKING, upcomingSlotsForDate } from "@/lib/bookingConfig";
import { listUpcomingMeetings, meetingRange } from "@/lib/zohoMeeting";

const CACHE_MS = 60 * 1000;
let cache = { at: 0, ranges: null };

export async function getBusyRanges({ fresh = false } = {}) {
  if (!fresh && cache.ranges && Date.now() - cache.at < CACHE_MS) return cache.ranges;
  const sessions = await listUpcomingMeetings();
  const ranges = sessions.map(meetingRange).filter(Boolean);
  cache = { at: Date.now(), ranges };
  return ranges;
}

export function invalidateBusyCache() {
  cache = { at: 0, ranges: null };
}

export function overlapsBusy(startMs, ranges) {
  const endMs = startMs + BOOKING.slotMinutes * 60000;
  return ranges.some((r) => startMs < r.end && endMs > r.start);
}

export async function availableSlotsForDate(dateKey) {
  const slots = upcomingSlotsForDate(dateKey);
  if (slots.length === 0) return [];
  const busy = await getBusyRanges();
  return slots.filter((s) => !overlapsBusy(s.start, busy));
}
