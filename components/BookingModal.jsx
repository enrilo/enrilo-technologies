"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, TextField, useMediaQuery } from "@mui/material";
import {
  BOOKING,
  humanSlotLabel,
  isBookableDay,
  parseDateKey,
  toDateKey,
  todayKeyIST,
} from "@/lib/bookingConfig";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const fieldSx = {
  marginBottom: "1.25rem",
  "& .MuiFormLabel-asterisk": { color: "#dc2626" },
  "& .MuiOutlinedInput-root": { borderRadius: "12px", backgroundColor: "#fff" },
};

// Visitor's local time for a slot, only when they're not on IST.
function localTimeHint(ms) {
  if (-new Date(ms).getTimezoneOffset() === BOOKING.utcOffsetMinutes) return null;
  return new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function monthMatrix(y, m) {
  const firstDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); // Sunday = 0
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells = Array(firstDow).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7) cells.push(null);
  return cells;
}

function ClockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
function VideoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="6" width="13" height="12" rx="2" />
      <path d="M16 10l5-3v10l-5-3z" />
    </svg>
  );
}
function GlobeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" />
    </svg>
  );
}
function CalendarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}

export default function BookingModal({ open, onClose }) {
  const isMobile = useMediaQuery("(max-width: 767px)");
  const todayKey = todayKeyIST();
  const today = parseDateKey(todayKey);

  const [step, setStep] = useState("pick"); // pick | details | done
  const [view, setView] = useState({ y: today.y, m: today.m });
  const [dateKey, setDateKey] = useState(null);
  const [slots, setSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState("");
  const [slotNotice, setSlotNotice] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedStart, setSelectedStart] = useState(null);
  const [form, setForm] = useState({ name: "", email: "", message: "", website: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [result, setResult] = useState(null);
  const slotCache = useRef(new Map());

  // Load slots for the selected date.
  useEffect(() => {
    if (!dateKey) return;
    const cached = slotCache.current.get(dateKey);
    if (cached) {
      setSlots(cached);
      setSlotsError("");
      return;
    }
    const ctrl = new AbortController();
    setSlotsLoading(true);
    setSlotsError("");
    setSlots([]);
    fetch(`/api/booking/slots?date=${dateKey}`, { signal: ctrl.signal })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Couldn't load available times.");
        slotCache.current.set(dateKey, data.slots);
        setSlots(data.slots);
      })
      .catch((err) => {
        if (err.name !== "AbortError") setSlotsError(err.message);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setSlotsLoading(false);
      });
    return () => ctrl.abort();
  }, [dateKey, reloadKey]);

  const cells = useMemo(() => monthMatrix(view.y, view.m), [view]);
  const lastBookable = useMemo(() => {
    const d = new Date(Date.UTC(today.y, today.m - 1, today.d + BOOKING.maxDaysAhead));
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 };
  }, [today.y, today.m, today.d]);
  const canPrev = view.y > today.y || (view.y === today.y && view.m > today.m);
  const canNext = view.y < lastBookable.y || (view.y === lastBookable.y && view.m < lastBookable.m);

  const handleClose = () => onClose(step === "done");

  const shiftMonth = (delta) => {
    setView(({ y, m }) => {
      const nm = m + delta;
      if (nm < 1) return { y: y - 1, m: 12 };
      if (nm > 12) return { y: y + 1, m: 1 };
      return { y, m: nm };
    });
  };

  const pickDate = (key) => {
    setDateKey(key);
    setSelectedStart(null);
    setSlotNotice("");
  };

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError("");
    try {
      const res = await fetch("/api/booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start: selectedStart, ...form }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409 || data.fields?.start) {
          // Slot got taken — refresh that day's slots and send them back to pick another.
          slotCache.current.delete(dateKey);
          setReloadKey((k) => k + 1);
          setSelectedStart(null);
          setStep("pick");
          setSlotNotice(data.error || "That time is no longer available. Please pick another slot.");
          return;
        }
        throw new Error(data.error || "Something went wrong. Please try again.");
      }
      setResult(data);
      setStep("done");
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const selectedDateLabel = dateKey
    ? new Date(Date.UTC(parseDateKey(dateKey).y, parseDateKey(dateKey).m - 1, parseDateKey(dateKey).d)).toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        timeZone: "UTC",
      })
    : "";

  // ---------- Left summary panel ----------
  const summary = (
    <aside className="border-b border-ink/10 p-6 md:w-[300px] md:shrink-0 md:border-b-0 md:border-r md:p-8">
      {step === "details" && (
        <button type="button" onClick={() => setStep("pick")} aria-label="Back to times"
          className="mb-5 grid h-10 w-10 place-items-center rounded-full border border-ink/15 text-ink transition-colors hover:bg-paper2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
      )}
      <p className="mb-1 text-[0.95rem] font-medium text-slatesoft">Enrilo Technologies</p>
      <h2 className="mb-5 text-[1.55rem] text-ink">{BOOKING.title}</h2>
      <ul className="m-0 list-none space-y-3 p-0 text-[1rem] font-medium text-slate">
        <li className="flex items-center gap-2.5"><ClockIcon /> {BOOKING.slotMinutes} min</li>
        <li className="flex items-center gap-2.5"><VideoIcon /> Zoho Meeting (link sent by email)</li>
        {selectedStart && (
          <li className="flex items-start gap-2.5 text-ink">
            <span className="mt-1"><CalendarIcon /></span>
            <span>
              {humanSlotLabel(selectedStart)}
              {localTimeHint(selectedStart) && (
                <span className="block text-[0.9rem] font-normal text-slatesoft">
                  {localTimeHint(selectedStart)} your local time
                </span>
              )}
            </span>
          </li>
        )}
        <li className="flex items-center gap-2.5"><GlobeIcon /> {BOOKING.tzName} ({BOOKING.tzLabel})</li>
      </ul>
      {step === "pick" && (
        <p className="mt-6 text-[0.98rem] text-slatesoft">
          A live walkthrough of AcadTracker, tailored to how your consultancy works. Bring your questions.
        </p>
      )}
    </aside>
  );

  // ---------- Step 1: calendar + times ----------
  const picker = (
    <div className="flex flex-1 flex-col md:flex-row">
      <div className="flex-1 p-6 md:p-8">
        <h3 className="mb-5 font-sans text-[1.2rem] font-semibold text-ink">Select a date &amp; time</h3>
        <div className="mb-4 flex items-center justify-between">
          <span className="text-[1.05rem] font-medium text-ink">{MONTH_NAMES[view.m - 1]} {view.y}</span>
          <div className="flex gap-2">
            <button type="button" onClick={() => shiftMonth(-1)} disabled={!canPrev} aria-label="Previous month"
              className="grid h-9 w-9 place-items-center rounded-full text-brassdark transition-colors hover:bg-brass/15 disabled:cursor-not-allowed disabled:text-slatesoft/40 disabled:hover:bg-transparent">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
            </button>
            <button type="button" onClick={() => shiftMonth(1)} disabled={!canNext} aria-label="Next month"
              className="grid h-9 w-9 place-items-center rounded-full text-brassdark transition-colors hover:bg-brass/15 disabled:cursor-not-allowed disabled:text-slatesoft/40 disabled:hover:bg-transparent">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg>
            </button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center">
          {WEEKDAYS.map((w) => (
            <div key={w} className="pb-2 text-[0.78rem] font-semibold uppercase tracking-wide text-slatesoft">{w}</div>
          ))}
          {cells.map((d, i) => {
            if (!d) return <div key={`e${i}`} />;
            const key = toDateKey(view.y, view.m, d);
            const bookable = isBookableDay(key);
            const selected = key === dateKey;
            const isToday = key === todayKey;
            return (
              <div key={key} className="flex justify-center">
                <button type="button" disabled={!bookable} onClick={() => pickDate(key)}
                  aria-pressed={selected} aria-label={`${d} ${MONTH_NAMES[view.m - 1]}${bookable ? "" : " (unavailable)"}`}
                  className={[
                    "relative grid h-11 w-11 place-items-center rounded-full text-[1rem] transition-colors",
                    selected
                      ? "bg-ink font-semibold text-white"
                      : bookable
                        ? "bg-brass/15 font-semibold text-brassdark hover:bg-brass/30"
                        : "cursor-default text-slatesoft/50",
                  ].join(" ")}>
                  {d}
                  {isToday && (
                    <span className={`absolute bottom-1.5 h-1 w-1 rounded-full ${selected ? "bg-white" : "bg-brassdark"}`} />
                  )}
                </button>
              </div>
            );
          })}
        </div>
        <p className="mt-6 flex items-center gap-2 text-[0.92rem] text-slatesoft">
          <GlobeIcon /> All times are in {BOOKING.tzName} ({BOOKING.tzLabel})
        </p>
      </div>

      {dateKey && (
        <div className="border-t border-ink/10 p-6 md:w-[250px] md:shrink-0 md:border-l md:border-t-0 md:px-5 md:py-8">
          <p className="mb-4 text-[1rem] font-medium text-ink">{selectedDateLabel}</p>
          {slotNotice && <p className="mb-3 text-[0.95rem] text-red-600">{slotNotice}</p>}
          {slotsError && <p className="mb-3 text-[0.95rem] text-red-600">{slotsError}</p>}
          {slotsLoading ? (
            <div className="space-y-2.5" aria-busy="true" aria-label="Loading times">
              {[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-[50px] animate-pulse rounded-lg bg-paper2" />)}
            </div>
          ) : !slotsError && slots.length === 0 ? (
            <p className="text-[0.95rem] text-slatesoft">No times left on this day. Please pick another date.</p>
          ) : (
            <div className="max-h-[360px] space-y-2.5 overflow-y-auto pr-1">
              {slots.map((s) => {
                const active = s.start === selectedStart;
                const hint = localTimeHint(s.start);
                return active ? (
                  <div key={s.start} className="grid grid-cols-2 gap-2">
                    <div className="grid place-items-center rounded-lg bg-slate text-[0.98rem] font-semibold text-white">{s.label}</div>
                    <button type="button" onClick={() => setStep("details")}
                      className="h-[50px] rounded-lg bg-brass text-[0.98rem] font-semibold text-ink transition-colors hover:bg-[#c79549]">
                      Next
                    </button>
                  </div>
                ) : (
                  <button key={s.start} type="button" onClick={() => setSelectedStart(s.start)}
                    className="flex h-[50px] w-full flex-col items-center justify-center rounded-lg border border-brass/60 text-[0.98rem] font-semibold text-brassdark transition-colors hover:border-brassdark hover:border-2">
                    {s.label}
                    {hint && <span className="text-[0.72rem] font-normal leading-none text-slatesoft">{hint} local</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );

  // ---------- Step 2: details form ----------
  const details = (
    <form onSubmit={submit} className="flex-1 p-6 md:p-8">
      <h3 className="mb-5 font-sans text-[1.2rem] font-semibold text-ink">Enter details</h3>
      <TextField label="Full Name" required fullWidth sx={fieldSx} value={form.name} autoComplete="name"
        slotProps={{ htmlInput: { maxLength: 100 } }} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <TextField label="Email ID" type="email" required fullWidth sx={fieldSx} value={form.email} autoComplete="email"
        helperText="We'll send the meeting invite and join link here." slotProps={{ htmlInput: { maxLength: 200 } }}
        onChange={(e) => setForm({ ...form, email: e.target.value })} />
      <TextField label="What should we prepare for this call?" required fullWidth multiline minRows={4} sx={fieldSx}
        value={form.message} slotProps={{ htmlInput: { maxLength: 2000 } }}
        placeholder="e.g. team size, number of branches, what you use today, features you're most interested in"
        onChange={(e) => setForm({ ...form, message: e.target.value })} />
      {/* Honeypot for bots — hidden from people and screen readers */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden"
        value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
      {submitError && <p className="mb-4 text-[1rem] text-red-600">{submitError}</p>}
      <button type="submit" disabled={submitting}
        className="rounded-full bg-brass px-6 py-3.5 text-[1.05rem] font-semibold text-ink shadow-lg shadow-brass/20 transition-colors hover:bg-[#c79549] disabled:opacity-60">
        {submitting ? "Scheduling…" : "Schedule Event"}
      </button>
    </form>
  );

  // ---------- Step 3: confirmation ----------
  const done = result && (
    <div className="flex flex-1 flex-col items-center px-6 py-12 text-center md:px-12">
      <div className="mb-5 grid h-14 w-14 place-items-center rounded-full bg-emerald-600 text-white">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>
      </div>
      <h2 className="mb-2 text-[1.6rem] text-ink">You are scheduled</h2>
      <p className="mx-auto mb-6 text-[1.02rem] text-slate">
        {result.emailSent
          ? `A confirmation with the meeting link has been sent to ${form.email}.`
          : `A calendar invitation is on its way to ${form.email}.`}
      </p>
      <div className="w-full max-w-md rounded-2xl border border-ink/10 bg-paper/60 p-5 text-left text-[1rem] text-ink2">
        <p className="mb-1 font-semibold text-ink">{BOOKING.title}</p>
        <p className="mb-1">{result.whenLabel}</p>
        {result.joinLink && (
          <p className="mb-1 break-all">
            Join link:{" "}
            <a href={result.joinLink} target="_blank" rel="noopener noreferrer" className="text-brassdark underline underline-offset-2">
              {result.joinLink}
            </a>
          </p>
        )}
        {result.password && <p className="mb-0">Password: <strong>{result.password}</strong></p>}
      </div>
      <button type="button" onClick={handleClose}
        className="mt-8 rounded-full border border-ink/20 px-6 py-3 text-[1rem] font-semibold text-ink transition-colors hover:bg-paper2">
        Close
      </button>
    </div>
  );

  return (
    <Dialog open={open} onClose={submitting ? undefined : handleClose} fullScreen={isMobile} maxWidth={false}
      aria-labelledby="booking-title"
      slotProps={{
        paper: {
          sx: {
            borderRadius: isMobile ? 0 : "20px",
            width: isMobile ? "100%" : step === "pick" && dateKey ? "1060px" : "900px",
            maxWidth: isMobile ? "100%" : "calc(100% - 32px)",
            transition: "width 200ms ease",
          },
        },
      }}>
      <span id="booking-title" className="sr-only">Book a walkthrough</span>
      <button type="button" onClick={handleClose} disabled={submitting} aria-label="Close"
        className="absolute right-3 top-3 z-10 grid h-10 w-10 place-items-center rounded-full text-slate transition-colors hover:bg-paper2">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
      <div className="flex min-h-[560px] flex-col bg-white md:flex-row">
        {step === "done" ? done : (
          <>
            {summary}
            {step === "pick" ? picker : details}
          </>
        )}
      </div>
    </Dialog>
  );
}
