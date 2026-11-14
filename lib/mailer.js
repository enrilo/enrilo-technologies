// Booking confirmation emails — SERVER ONLY.
// Uses SMTP (works with Zoho Mail: smtp.zoho.in, port 465, secure=true, with an app password).
//
// Env vars:
//   SMTP_HOST, SMTP_PORT (465), SMTP_SECURE ("true"), SMTP_USER, SMTP_PASS
//   MAIL_FROM            e.g. "Enrilo Technologies <contactus@enrilotechnologies.com>"
//   BOOKING_NOTIFY_EMAIL optional — where to send "new booking" notices for you
//   SEND_BOOKING_EMAIL   set to "false" to stop sending our own email (if Zoho's invite is enough)

import nodemailer from "nodemailer";
import { BOOKING } from "@/lib/bookingConfig";

export function isMailerConfigured() {
  return (
    process.env.SEND_BOOKING_EMAIL !== "false" &&
    Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
  );
}

let transporter = null;
function getTransporter() {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT || 465);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transporter;
}

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const icsDate = (ms) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsText = (s) => String(s ?? "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (c) => `\\${c}`);

function buildIcs({ uid, startMs, title, description, joinLink, organizerEmail, attendeeEmail }) {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Enrilo Technologies//Booking//EN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${icsDate(Date.now())}`,
    `DTSTART:${icsDate(startMs)}`,
    `DTEND:${icsDate(startMs + BOOKING.slotMinutes * 60000)}`,
    `SUMMARY:${icsText(title)}`,
    `DESCRIPTION:${icsText(description)}`,
    joinLink ? `LOCATION:${icsText(joinLink)}` : null,
    joinLink ? `URL:${joinLink}` : null,
    organizerEmail ? `ORGANIZER:mailto:${organizerEmail}` : null,
    `ATTENDEE;ROLE=REQ-PARTICIPANT:mailto:${attendeeEmail}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
}

export async function sendBookingEmails({ name, email, message, startMs, whenLabel, joinLink, password, meetingKey }) {
  const from = process.env.MAIL_FROM || process.env.SMTP_USER;
  const organizerEmail = (from.match(/<([^>]+)>/) || [, from])[1];
  const title = `${BOOKING.title} with Enrilo Technologies`;

  const detailsText = [
    `When: ${whenLabel}`,
    `Join link: ${joinLink || "(will be shared separately)"}`,
    password ? `Meeting password: ${password}` : null,
    meetingKey ? `Meeting ID: ${meetingKey}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const ics = buildIcs({
    uid: `${meetingKey || startMs}@enrilotechnologies.com`,
    startMs,
    title,
    description: detailsText,
    joinLink,
    organizerEmail,
    attendeeEmail: email,
  });

  const html = `
  <div style="font-family:Arial,sans-serif;color:#1b1f27;line-height:1.6;max-width:560px">
    <h2 style="color:#152238;margin:0 0 12px">Your walkthrough is booked</h2>
    <p>Hi ${esc(name)},</p>
    <p>Thanks for booking a walkthrough of AcadTracker. Here are your meeting details:</p>
    <table style="border-collapse:collapse;margin:16px 0">
      <tr><td style="padding:6px 16px 6px 0;color:#6b7688">When</td><td style="padding:6px 0"><strong>${esc(whenLabel)}</strong></td></tr>
      <tr><td style="padding:6px 16px 6px 0;color:#6b7688">Where</td><td style="padding:6px 0">Zoho Meeting</td></tr>
      ${password ? `<tr><td style="padding:6px 16px 6px 0;color:#6b7688">Password</td><td style="padding:6px 0"><strong>${esc(password)}</strong></td></tr>` : ""}
      ${meetingKey ? `<tr><td style="padding:6px 16px 6px 0;color:#6b7688">Meeting ID</td><td style="padding:6px 0">${esc(meetingKey)}</td></tr>` : ""}
    </table>
    ${joinLink ? `<p><a href="${esc(joinLink)}" style="display:inline-block;background:#b8863b;color:#152238;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:bold">Join the meeting</a></p>` : ""}
    <p style="color:#6b7688;font-size:14px">A calendar invite (.ics) is attached. Need to reschedule? Just reply to this email.</p>
    <p>— Team Enrilo Technologies</p>
  </div>`;

  const text = `Hi ${name},\n\nThanks for booking a walkthrough of AcadTracker.\n\n${detailsText}\n\nNeed to reschedule? Just reply to this email.\n\n— Team Enrilo Technologies`;

  const t = getTransporter();
  const jobs = [
    t.sendMail({
      from,
      to: email,
      replyTo: process.env.BOOKING_NOTIFY_EMAIL || from,
      subject: `Confirmed: ${title} — ${whenLabel}`,
      text,
      html,
      icalEvent: { method: "PUBLISH", filename: "invite.ics", content: ics },
    }),
  ];

  if (process.env.BOOKING_NOTIFY_EMAIL) {
    jobs.push(
      t.sendMail({
        from,
        to: process.env.BOOKING_NOTIFY_EMAIL,
        replyTo: email,
        subject: `New walkthrough booking: ${name} — ${whenLabel}`,
        text: `Name: ${name}\nEmail: ${email}\n\n${detailsText}\n\nMessage:\n${message}`,
      })
    );
  }

  const results = await Promise.allSettled(jobs);
  const failed = results.filter((r) => r.status === "rejected");
  failed.forEach((r) => console.error("[booking] email failed:", r.reason?.message || r.reason));
  return results[0].status === "fulfilled";
}
