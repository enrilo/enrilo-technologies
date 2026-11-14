import { NextResponse } from "next/server";
import { BOOKING, humanSlotLabel, isValidSlotStart, zohoStartTime } from "@/lib/bookingConfig";
import { getBusyRanges, invalidateBusyCache, overlapsBusy } from "@/lib/bookingAvailability";
import { createMeeting, isZohoConfigured } from "@/lib/zohoMeeting";
import { isMailerConfigured, sendBookingEmails } from "@/lib/mailer";
import { normalizeBookingFields, validateBookingFields } from "@/lib/bookingValidation";

export const dynamic = "force-dynamic";

// POST /api/booking  { start, name, email, message, website (honeypot) }
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // Honeypot: real users never fill this hidden field. Pretend success for bots.
  if (body.website) return NextResponse.json({ ok: true });

  const start = Number(body.start);
  const { name, email, message } = normalizeBookingFields(body);

  const errors = validateBookingFields(body);
  if (!isValidSlotStart(start)) errors.start = "That time is no longer available. Please pick another slot.";
  if (Object.keys(errors).length) {
    return NextResponse.json({ error: Object.values(errors)[0], fields: errors }, { status: 400 });
  }

  if (!isZohoConfigured()) {
    console.error("[booking] Zoho env vars are missing");
    return NextResponse.json({ error: "Booking is temporarily unavailable." }, { status: 503 });
  }

  try {
    // Re-check against live Zoho data right before booking to avoid double bookings.
    const busy = await getBusyRanges({ fresh: true });
    if (overlapsBusy(start, busy)) {
      return NextResponse.json(
        { error: "Sorry, someone just booked that time. Please pick another slot.", code: "SLOT_TAKEN" },
        { status: 409 }
      );
    }

    const whenLabel = humanSlotLabel(start);
    const session = await createMeeting({
      topic: `${BOOKING.title} — ${name}`,
      agenda: `Booked via enrilotechnologies.com\nName: ${name}\nEmail: ${email}\n\nMessage:\n${message}`,
      startTime: zohoStartTime(start),
      durationMinutes: BOOKING.slotMinutes,
      participants: [email],
    });
    invalidateBusyCache();

    let emailSent = false;
    if (isMailerConfigured()) {
      try {
        emailSent = await sendBookingEmails({
          name,
          email,
          message,
          startMs: start,
          whenLabel,
          joinLink: session?.joinLink,
          password: session?.pwd,
          meetingKey: session?.meetingKey,
        });
      } catch (err) {
        console.error("[booking] email failed:", err);
      }
    }

    // Never return session.startLink — that's the host link.
    return NextResponse.json({
      ok: true,
      start,
      whenLabel,
      joinLink: session?.joinLink || null,
      password: session?.pwd || null,
      emailSent,
    });
  } catch (err) {
    console.error("[booking] create failed:", err);
    return NextResponse.json(
      { error: "We couldn't complete your booking. Please try again, or email contactus@enrilotechnologies.com." },
      { status: 502 }
    );
  }
}
