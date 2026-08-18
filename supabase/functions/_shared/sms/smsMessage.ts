/**
 * smsMessage — composing the one SMS this platform sends (plan L6).
 *
 * Pure and provider-agnostic: no Twilio, no 10DLC. A provider can be chosen
 * later without touching any of this, and these rules are the ones that decide
 * whether the bill is 5 cents or 10 cents per exhibitor per trial.
 *
 * SCOPE IS THE PRE-RUN ALERT ONLY. Not results, not schedule changes. Every
 * extra message type is another carrier-filtering risk and another thing to
 * get consent for; the plan says give the one alert away free and stop there.
 *
 * ENCODING IS THE COST LEVER. A GSM-7 segment holds 160 characters. A single
 * character outside GSM-7 — an emoji, a curly quote, an en dash — forces the
 * whole message to UCS-2, where a segment is 70 characters. A 130-character
 * message with one smart quote silently becomes two segments: double cost, for
 * a character nobody asked for. So messages are built from a GSM-7-safe
 * alphabet and validated, not merely "kept short".
 */

/** GSM 03.38 basic set plus the escape-table extensions, minus the ones no
 *  message here needs. Characters outside this force UCS-2. */
const GSM7_CHARS = new Set(
  [
    ...'@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?',
    ...'¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà',
    '\n',
    '\r',
  ].flat()
);

/** Extension characters cost TWO septets each, not one. */
const GSM7_EXTENDED = new Set(['^', '{', '}', '\\', '[', ']', '~', '|', '€']);

export const GSM7_SEGMENT_LIMIT = 160;
export const UCS2_SEGMENT_LIMIT = 70;

export function isGsm7(text: string): boolean {
  for (const char of text) {
    if (!GSM7_CHARS.has(char) && !GSM7_EXTENDED.has(char)) return false;
  }
  return true;
}

/** Septet count — extension chars count double. Not the same as text.length. */
export function gsm7Length(text: string): number {
  let length = 0;
  for (const char of text) length += GSM7_EXTENDED.has(char) ? 2 : 1;
  return length;
}

function truncateGsm7(text: string, maxSeptets: number): string {
  let usedSeptets = 0;
  let result = '';

  for (const char of text) {
    const charSeptets = gsm7Length(char);
    if (usedSeptets + charSeptets > maxSeptets) break;
    result += char;
    usedSeptets += charSeptets;
  }

  return result;
}

export interface SegmentEstimate {
  encoding: 'GSM-7' | 'UCS-2';
  /** Billable segments. Anything above 1 is money for nothing here. */
  segments: number;
  length: number;
}

export function estimateSegments(text: string): SegmentEstimate {
  if (isGsm7(text)) {
    const length = gsm7Length(text);
    return {
      encoding: 'GSM-7',
      length,
      segments: Math.max(1, Math.ceil(length / GSM7_SEGMENT_LIMIT)),
    };
  }
  return {
    encoding: 'UCS-2',
    length: [...text].length,
    segments: Math.max(1, Math.ceil([...text].length / UCS2_SEGMENT_LIMIT)),
  };
}

/**
 * Replace the typography that word processors and copy-paste introduce with
 * GSM-7 equivalents. A club name pasted from a Word document is the realistic
 * way a curly quote reaches a message and doubles its cost.
 */
export function toGsm7Safe(text: string): string {
  return text
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/…/g, '...')
    .replace(/ /g, ' ')
    // Anything still outside the alphabet (emoji, accents we don't map) is
    // dropped rather than allowed to flip the whole message to UCS-2.
    .split('')
    .filter(char => GSM7_CHARS.has(char) || GSM7_EXTENDED.has(char))
    .join('')
    .replace(/ {2,}/g, ' ')
    .trim();
}

export interface ProximitySmsInput {
  dogName: string | null;
  className: string;
  dogsAhead: number;
  /** Included when known — it is how an exhibitor identifies themselves. */
  armband: number | null;
}

/**
 * The pre-run alert. Built to sit inside ONE GSM-7 segment even with long
 * club/class names, because the second segment costs as much as the first and
 * carries no extra information.
 */
export function buildProximitySms(input: ProximitySmsInput): string {
  const dog = toGsm7Safe(input.dogName ?? '') || 'Your dog';
  const armband = input.armband !== null ? ` (#${input.armband})` : '';
  const lead =
    input.dogsAhead <= 0
      ? `${dog}${armband} is up next`
      : `${dog}${armband} is ${input.dogsAhead} dogs out`;

  // Class name is the variable-length part, so it is what gets trimmed if
  // anything must give — the count and the dog matter more than the full name.
  const suffix = ' - myK9Show';
  const className = toGsm7Safe(input.className);
  const budget = GSM7_SEGMENT_LIMIT - gsm7Length(`${lead} in ${suffix}`);
  let trimmedClass = className;
  if (gsm7Length(className) > budget) {
    const marker = '.';
    const classBudget = budget - gsm7Length(marker);
    trimmedClass = classBudget >= 0 ? `${truncateGsm7(className, classBudget)}${marker}` : '';
  }

  const message = trimmedClass ? `${lead} in ${trimmedClass}${suffix}` : `${lead}${suffix}`;
  return message;
}

/**
 * E.164 normalization. Defaults to +1 for bare 10-digit US numbers, which is
 * what an exhibitor will type. Returns null rather than guessing when the
 * input cannot be resolved — sending to a wrong number is a TCPA problem, not
 * a UX inconvenience.
 */
export function toE164(input: string, defaultCountryCode = '1'): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('+')) {
    const digits = trimmed.slice(1).replace(/[^0-9]/g, '');
    if (digits.length < 7 || digits.length > 15 || digits.startsWith('0')) return null;
    return `+${digits}`;
  }

  const digits = trimmed.replace(/[^0-9]/g, '');
  if (digits.length === 10) return `+${defaultCountryCode}${digits}`;
  // 11 digits starting with the country code, e.g. 12105550142.
  if (digits.length === 11 && digits.startsWith(defaultCountryCode)) return `+${digits}`;
  return null;
}
