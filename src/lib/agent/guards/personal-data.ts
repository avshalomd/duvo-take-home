/**
 * Personal data in an output file, counted rather than refused: a CSV of contacts is often exactly what the task
 * asked for, so the file card says "12 email addresses" and the person decides. Every counter returns the number of
 * DISTINCT values, so a contact repeated on every row counts once. Each pattern is a shape first, then a check
 * (Luhn for cards, mod-97 for IBANs, digit counts and date shapes for phones), because a shape alone matches ids.
 * Every quantifier is bounded, so a long unbroken token in a file cannot make a pattern run for seconds.
 */

const distinct = (values: Iterable<string>) => new Set(values).size;

// ---- email addresses
// Local part at most 64 characters (the standard's limit), then a domain of dot-separated labels and a letter TLD.
const EMAIL = /[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63}){0,8}\.([A-Za-z]{2,24})\b/g;
const IMAGE_SUFFIX = /^(?:png|jpe?g|gif|svg|webp|avif)$/i; // logo@2x.png is a retina image name, not an address

export function countEmails(text: string): number {
  const found = [...text.matchAll(EMAIL)].filter((m) => !IMAGE_SUFFIX.test(m[1])).map((m) => m[0].toLowerCase());
  return distinct(found);
}

// ---- phone numbers
// A phone-shaped run: "+" and a country code, or digit groups split by single spaces, dots or dashes. It may not
// start right after a letter, digit, dot, slash or dash, nor stop just before more of the same, so the middle of a
// version, a date or an IP address never starts or ends a match.
const PHONE = /(?<![\w.+/-])(?:\+\d{1,3}(?:[ .-]?\(?\d{1,5}\)?){1,6}|\(?\d{2,8}\)?(?:[ .-]\d{2,8}){1,4})(?![\w/]|[.-]\d)/g;
const DATE_START = /^(?:\d{4}[./-]\d{1,2}[./-]\d{1,2}|\d{1,2}[./-]\d{1,2}[./-]\d{4})(?!\d)/; // 2024-01-15, 15.01.2024
const US_SHAPE = /^\(?\d{3}\)?[ .-]?\d{3}[ .-]\d{4}$/; // (555) 123-4567, 555-123-4567, 555.123.4567

function isPhone(candidate: string): boolean {
  const digits = candidate.replace(/\D/g, "");
  // International: E.164 allows at most 15 digits; fewer than 8 is a short code, not a person's number.
  if (candidate.startsWith("+")) return digits.length >= 8 && digits.length <= 15;
  if (DATE_START.test(candidate)) return false; // "2024-01-15 10:30" has ten digits too
  // National: 10 or 11 digits, with the trunk 0 most countries dial (020 7946 0958, 01 23 45 67 89) or in the
  // US shape. Unseparated national numbers are not counted: 07700900123 cannot be told from an order id.
  if (digits.length < 10 || digits.length > 11) return false;
  return digits.startsWith("0") || US_SHAPE.test(candidate);
}

export function countPhones(text: string): number {
  const found = [...text.matchAll(PHONE)].map((m) => m[0]).filter(isPhone).map((p) => p.replace(/\D/g, ""));
  return distinct(found);
}

// ---- payment card numbers
// 13 to 19 digits: in groups of four (Visa, Mastercard), 4-6-5 (Amex), or unbroken. The word boundaries keep a
// card-length slice of a longer number from matching.
const CARD = /\b(?:\d{4}([ -]?)\d{4}\1\d{4}\1\d{1,4}|\d{4}([ -]?)\d{6}\2\d{5}|\d{13,19})\b/g;

/** The Luhn checksum every card number carries: double every second digit from the right, the sum ends in 0. */
export function luhn(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

// Luhn still lets one random number in ten through, so a long column of 16-digit ids can yield a false card. That
// is acceptable here: the result is a count on the file card, never a failed run.
export function countCards(text: string): number {
  const found = [...text.matchAll(CARD)].map((m) => m[0].replace(/\D/g, "")).filter(luhn);
  return distinct(found);
}

// ---- IBANs
// Two letters, two check digits, then up to 30 letters or digits, printed in groups of four or unbroken.
const IBAN = /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,4})?\b/g;

/** ISO 13616: move the first four characters to the end, read letters as 10..35, and the number mod 97 is 1. */
export function ibanValid(candidate: string): boolean {
  const iban = candidate.replace(/ /g, "");
  if (iban.length < 15 || iban.length > 34) return false; // Norway's 15 is the shortest, 34 the standard's ceiling
  let rest = 0;
  for (const ch of iban.slice(4) + iban.slice(0, 4)) {
    const value = ch >= "A" ? ch.charCodeAt(0) - 55 : Number(ch); // A=10 ... Z=35
    rest = (value > 9 ? rest * 100 + value : rest * 10 + value) % 97; // digit by digit: the number is too big to hold
  }
  return rest === 1;
}

export function countIbans(text: string): number {
  const found = [...text.matchAll(IBAN)].map((m) => m[0].replace(/ /g, "")).filter(ibanValid);
  return distinct(found);
}
