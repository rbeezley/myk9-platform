/**
 * Shared rendering rules for operator-alert `detail` JSON. Used by both the
 * admin dashboard's triage queue (summarizeAlertDetail) and the system-health
 * alerts rail (formatAlertDetail) so the two surfaces can never disagree about
 * how a detail value reads.
 */

/** Keys whose value IS the message; prefixing them ("html: …") is noise. */
const MESSAGE_KEYS = /^(html|message|text|body|detail)$/i;

/**
 * Values can arrive as rendered markup (production alerts store serialized
 * HTML under an `html` key). Show the sentence, never the serialization.
 * Only strips things shaped like tags (`<p>`, `</code>`, `<br/>`), so prose
 * like "cpu < 80 and mem > 90" survives intact.
 */
export function toPlainText(value: unknown): string {
  return String(value)
    .replace(/<\/?[a-z][^>]*>/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * One detail entry as display text, or null when it should be skipped
 * (nested objects, nulls, values that strip to nothing).
 */
export function detailEntryToText(key: string, value: unknown): string | null {
  if (value === null || typeof value === 'object') return null;
  const text = toPlainText(value);
  if (!text) return null;
  return MESSAGE_KEYS.test(key) ? text : `${key}: ${text}`;
}
