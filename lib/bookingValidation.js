// Field rules for the booking form — shared by the form (live feedback) and the API (enforcement).

// Letters from any language, words separated by a space, hyphen, apostrophe or dot.
// e.g. "Aunsh Patel", "Mary-Jane O'Neil", "R. K. Sharma", "José Álvarez".
export const NAME_RE = /^[\p{L}\p{M}]+(?:[ .'’-]+[\p{L}\p{M}]+)*\.?$/u;

// Practical email check: local part without leading/trailing/double dots, domain labels that
// don't start or end with "-", and a letters-only top-level domain of 2+ characters.
export const EMAIL_RE =
  /^(?!\.)(?!.*\.\.)[A-Za-z0-9._%+-]+(?<!\.)@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,24}$/;

// Message must contain at least one letter, and no HTML tags or control characters (newlines/tabs are fine).
const HAS_LETTER_RE = /\p{L}/u;
const HTML_TAG_RE = /<\/?[a-z!][^>]*>/i;
const CONTROL_CHARS_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

export const LIMITS = { name: [2, 100], email: [6, 200], message: [10, 2000] };

export function normalizeBookingFields({ name, email, message }) {
  return {
    name: String(name ?? "").trim().replace(/\s+/g, " "),
    email: String(email ?? "").trim().toLowerCase(),
    message: String(message ?? "").trim(),
  };
}

// Returns { name?, email?, message? } with a message for each invalid field.
export function validateBookingFields(raw) {
  const { name, email, message } = normalizeBookingFields(raw);
  const errors = {};

  if (!name) errors.name = "Please enter your full name.";
  else if (name.length < LIMITS.name[0] || name.length > LIMITS.name[1])
    errors.name = `Name must be ${LIMITS.name[0]}–${LIMITS.name[1]} characters.`;
  else if (!NAME_RE.test(name))
    errors.name = "Please use letters only (spaces, hyphens, apostrophes and dots are fine).";

  if (!email) errors.email = "Please enter your email address.";
  else if (email.length > LIMITS.email[1] || !EMAIL_RE.test(email))
    errors.email = "Please enter a valid email address, e.g. name@company.com.";

  if (!message) errors.message = "Please tell us what you'd like us to prepare.";
  else if (message.length < LIMITS.message[0])
    errors.message = `Please add a little more detail (at least ${LIMITS.message[0]} characters).`;
  else if (message.length > LIMITS.message[1])
    errors.message = `Please keep it under ${LIMITS.message[1]} characters.`;
  else if (!HAS_LETTER_RE.test(message)) errors.message = "Please describe what you'd like to see in words.";
  else if (HTML_TAG_RE.test(message) || CONTROL_CHARS_RE.test(message))
    errors.message = "Please remove HTML tags or special control characters.";

  return errors;
}
