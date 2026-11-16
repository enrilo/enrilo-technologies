/**
 * The single place that talks to Google Tag Manager's dataLayer.
 * Never push to window.dataLayer or call window.gtag anywhere else.
 *
 * GTM only loads in production builds after the visitor accepts cookies
 * (see components/GtmLoader.jsx). Until then window.dataLayer does not
 * exist and trackEvent quietly does nothing.
 */

// Every parameter any event sends. GTM's data layer keeps values from
// earlier pushes, so each push resets all of them first; otherwise a later
// event would inherit a stale parameter from an earlier one.
const KNOWN_PARAMS = ["location", "form_name"];

export function trackEvent(name, params = {}) {
  if (typeof window === "undefined" || !Array.isArray(window.dataLayer)) return;

  const reset = Object.fromEntries(KNOWN_PARAMS.map((key) => [key, undefined]));
  window.dataLayer.push({ event: name, ...reset, ...params });
}
