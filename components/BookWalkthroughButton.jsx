"use client";

import { useState } from "react";
import dynamic from "next/dynamic";

// Loaded on first click so the booking UI doesn't add weight to the initial page load.
const BookingModal = dynamic(() => import("@/components/BookingModal"), { ssr: false });

export default function BookWalkthroughButton({ className, children = "Book A Walkthrough" }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [modalKey, setModalKey] = useState(0);
  const [booked, setBooked] = useState(false);

  const openModal = () => {
    // Start fresh if the previous visit ended in a completed booking.
    if (booked) {
      setModalKey((k) => k + 1);
      setBooked(false);
    }
    setMounted(true);
    setOpen(true);
  };

  return (
    <>
      <button type="button" className={className} onClick={openModal}>
        {children}
      </button>
      {mounted && <BookingModal key={modalKey} open={open} onClose={(didBook) => { setOpen(false); if (didBook) setBooked(true); }} />}
    </>
  );
}
