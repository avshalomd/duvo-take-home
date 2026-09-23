// A plain decimal: no leading zeros (a postcode or an id like "01067" stays text), no thousands separators, no units.
const PLAIN_NUMBER = /^-?(0|[1-9]\d*)(\.\d+)?$/;

/**
 * The number a cell means, when the agent sent it as text ("1250.5"), so charts can draw it and Excel can sum it.
 * Anything that is not plainly a number is returned unchanged.
 */
export function asNumber<T>(value: T): T | number {
  if (typeof value !== "string" || !PLAIN_NUMBER.test(value)) return value;
  if (value.replace(/[-.]/g, "").length > 15) return value; // past 15 digits a double loses digits: keep the text
  return Number(value);
}
