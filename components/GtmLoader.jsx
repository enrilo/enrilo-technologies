"use client";

import { useEffect, useState } from "react";
import { GoogleTagManager } from "@next/third-parties/google";
import { CONSENT_CHANGE_EVENT, CONSENT_STORAGE_KEY } from "@/components/CookieConsent";

// Inlined at build time from NEXT_PUBLIC_GTM_ID (see .env.local.example).
const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID;
const ENABLED = process.env.NODE_ENV === "production" && Boolean(GTM_ID);

function hasConsent() {
  try {
    return localStorage.getItem(CONSENT_STORAGE_KEY) === "granted";
  } catch {
    return false;
  }
}

/**
 * Loads Google Tag Manager only in production builds and only after the
 * visitor accepts cookies, including when they accept mid-session.
 * GA4 itself is configured inside the GTM container, never in code.
 */
export default function GtmLoader() {
  const [granted, setGranted] = useState(false);

  useEffect(() => {
    if (!ENABLED) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the choice lives in localStorage, which is only readable after mount
    setGranted(hasConsent());

    const onChange = (e) => {
      if (e.detail?.granted) {
        setGranted(true);
      } else if (window.google_tag_manager) {
        // A loaded GTM can't be unloaded; reload so withdrawn consent takes effect now.
        window.location.reload();
      }
    };
    window.addEventListener(CONSENT_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(CONSENT_CHANGE_EVENT, onChange);
  }, []);

  if (!ENABLED || !granted) return null;
  return <GoogleTagManager gtmId={GTM_ID} />;
}
