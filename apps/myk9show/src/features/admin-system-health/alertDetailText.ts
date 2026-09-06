/**
 * Shared rendering rules for operator-alert `detail` JSON. Used by both the
 * admin dashboard's triage queue (summarizeAlertDetail) and the system-health
 * alerts rail (formatAlertDetail) so the two surfaces can never disagree about
 * how a detail value reads.
 *
 * Merged from two independent fixes for the same defect (#1689 and #1694):
 * object values render as compact JSON rather than being dropped, values are
 * capped, and tag stripping is narrowed to tag-shaped text.
 */

/** Keys whose value IS the message; prefixing them ("html: …") is noise. */
const MESSAGE_KEYS = /^(html|message|text|body|detail)$/i;

/** Longest value a detail line renders before truncating. */
const DETAIL_VALUE_MAX_CHARS = 120;

/**
 * Values can arrive as rendered markup (production alerts store serialized
 * HTML under an `html` key) or as nested objects. Show the sentence, never the
 * serialization, and never `[object Object]`.
 *
 * The tag pattern deliberately requires a letter after `<`, so prose such as
 * "cpu < 80 and mem > 90" survives while `<p>` / `</code>` / `<br/>` do not.
 */
function toPlainText(value: unknown): string {
  let text: string;
  if (value !== null && typeof value === 'object') {
    try {
      text = JSON.stringify(value);
    } catch {
      text = String(value);
    }
  } else {
    text = String(value);
  }

  return text
    .replace(/<\/?[a-z][^>]*>/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * One detail entry as display text, or null when there is nothing to show
 * (null values, or values that strip to nothing).
 */
export function detailEntryToText(
  key: string,
  value: unknown,
  options: { full?: boolean } = {}
): string | null {
  if (value === null) return null;
  const text = toPlainText(value);
  if (!text) return null;
  if (options.full) return MESSAGE_KEYS.test(key) ? text : `${key}: ${text}`;
  // Existing alerts store the payout writer's HTML, not structured amounts.
  // Recognize only its complete sentence; never infer amounts from arbitrary
  // diagnostics. Keep the original available through the full-text path.
  const mismatch = MESSAGE_KEYS.test(key)
    ? text.match(
        /^Show [\da-f-]{36} was reconciled to existing transfer tr_\w+ for (\$[\d,]+\.\d{2}), but today's recompute from entries says (\$[\d,]+\.\d{2}) is owed\./i
      )
    : null;
  if (mismatch) {
    return `Existing payout: ${mismatch[1]}. Recalculated amount owed: ${mismatch[2]}. Review this payout before resolving.`;
  }
  const capped =
    text.length > DETAIL_VALUE_MAX_CHARS ? `${text.slice(0, DETAIL_VALUE_MAX_CHARS)}…` : text;
  return MESSAGE_KEYS.test(key) ? capped : `${key}: ${capped}`;
}
