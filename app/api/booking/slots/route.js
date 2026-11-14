import { NextResponse } from "next/server";
import { parseDateKey } from "@/lib/bookingConfig";
import { availableSlotsForDate } from "@/lib/bookingAvailability";
import { isZohoConfigured } from "@/lib/zohoMeeting";

export const dynamic = "force-dynamic";

// GET /api/booking/slots?date=YYYY-MM-DD  ->  { slots: [{ start: <utc ms>, label: "10:00 AM" }] }
export async function GET(request) {
  const date = request.nextUrl.searchParams.get("date");
  if (!parseDateKey(date)) {
    return NextResponse.json({ error: "Invalid date." }, { status: 400 });
  }
  if (!isZohoConfigured()) {
    console.error("[booking] Zoho env vars are missing");
    return NextResponse.json({ error: "Booking is temporarily unavailable." }, { status: 503 });
  }
  try {
    const slots = await availableSlotsForDate(date);
    return NextResponse.json({ slots }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[booking] slots failed:", err);
    return NextResponse.json({ error: "Couldn't load available times. Please try again." }, { status: 502 });
  }
}
