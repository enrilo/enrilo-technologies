"use client";

import Link from "next/link";
import { trackEvent } from "@/lib/analytics";

/**
 * Drop-in replacement for <a> (or next/link with `next`) that also sends a
 * GTM event on click. Lets server components track clicks without becoming
 * client components. Renders exactly the same markup as the original link.
 */
export default function TrackedLink({ event, eventParams, next = false, onClick, ...props }) {
  const handleClick = (e) => {
    trackEvent(event, eventParams);
    onClick?.(e);
  };
  return next ? <Link {...props} onClick={handleClick} /> : <a {...props} onClick={handleClick} />;
}
