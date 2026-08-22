/**
 * Inbound SMS keyword handling for ring alerts (MYK9-192).
 *
 * This webhook is NOT the safety mechanism. Twilio's Messaging Service enforces
 * STOP at the platform layer once Advanced Opt-Out is on, and that holds
 * whether or not this code runs. What this does is let our own send path learn:
 * without it `sms_opt_out_at` stays null, the sendable partial index keeps
 * counting the row, and every later alert is a message Twilio silently drops.
 */

/**
 * Twilio's own default keyword sets. Handling only STOP would leave the exact
 * bug this function exists to close: Twilio acts on UNSTOP and YES too, so a
 * number un-blocked at the carrier while our row still says opted-out is a
 * silent divergence in the other direction.
 */
const STOP_KEYWORDS = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT']);
const START_KEYWORDS = new Set(['START', 'YES', 'UNSTOP']);
const HELP_KEYWORDS = new Set(['HELP', 'INFO']);

export type InboundKeyword = 'stop' | 'start' | 'help' | 'unknown';

export function classifyKeyword(body: string | undefined): InboundKeyword {
  // Carriers and keyboards add whitespace, punctuation and case freely. Match
  // the first word only: "STOP please" is unambiguously a STOP.
  const first = (body ?? '')
    .trim()
    .split(/\s+/)[0]
    .replace(/[^\p{L}]/gu, '')
    .toUpperCase();
  if (!first) return 'unknown';
  if (STOP_KEYWORDS.has(first)) return 'stop';
  if (START_KEYWORDS.has(first)) return 'start';
  if (HELP_KEYWORDS.has(first)) return 'help';
  return 'unknown';
}

export interface SmsConsentStateRow {
  id: string;
  sms_phone_e164: string | null;
  upcoming_runs: boolean | null;
  sms_opt_out_at: string | null;
  sms_opt_in_at: string | null;
  sms_consent_text_version: string | null;
  sms_opt_in_source: string | null;
  sms_consent_write_token: string | null;
  sms_stop_muted_push_at: string | null;
}

/**
 * A START may only revive a consent record that is still intact. A START from
 * a number we hold no consent for is a no-op — never an insert. Receiving a
 * text is not consent to send one.
 */
export function hasIntactConsent(row: SmsConsentStateRow): boolean {
  return (
    // Phone included because the sendable-complete constraint requires it
    // non-null whenever sms_enabled is true. findByPhone guarantees it today,
    // but this is exported and unit-tested standalone — a caller that does not
    // pre-filter would otherwise produce a 23514 on START.
    row.sms_phone_e164 !== null &&
    row.sms_opt_in_at !== null &&
    row.sms_consent_text_version !== null &&
    row.sms_opt_in_source !== null &&
    row.sms_consent_write_token !== null
  );
}

export interface StopUpdate {
  sms_opt_out_at: string;
  sms_enabled: false;
  upcoming_runs?: false;
  sms_stop_muted_push_at?: string;
}

export interface StartUpdate {
  sms_opt_out_at: null;
  sms_enabled: true;
  upcoming_runs?: true;
  sms_stop_muted_push_at?: null;
}

/**
 * The row keeps its consent history — proving WHEN sending stopped matters as
 * much as proving when it began, so nothing here deletes.
 *
 * `sms_enabled` has to go false alongside the timestamp. The
 * `notification_preferences_sms_sendable_complete` constraint added in
 * 20260822120000 forbids `sms_enabled = true` with a non-null `sms_opt_out_at`,
 * so writing only the timestamp would fail the whole update. (The issue was
 * written against the older, laxer constraint that did permit that combination
 * — it no longer does.)
 *
 * `mutesPush` is decision B: STOP silences both channels. It is false when the
 * exhibitor had already turned ring alerts off, because then STOP took nothing
 * from push and START must give nothing back.
 */
export function buildStopUpdate(mutesPush: boolean, now: Date): StopUpdate {
  const at = now.toISOString();
  return mutesPush
    ? { sms_opt_out_at: at, sms_enabled: false, upcoming_runs: false, sms_stop_muted_push_at: at }
    : { sms_opt_out_at: at, sms_enabled: false };
}

/** Restores exactly what STOP took away, and nothing the user chose. */
export function buildStartUpdate(restoresPush: boolean): StartUpdate {
  return restoresPush
    ? { sms_opt_out_at: null, sms_enabled: true, upcoming_runs: true, sms_stop_muted_push_at: null }
    : { sms_opt_out_at: null, sms_enabled: true };
}

export interface InboundSmsPorts {
  findByPhone(phone: string): Promise<SmsConsentStateRow[]>;
  applyUpdate(rowIds: string[], update: StopUpdate | StartUpdate): Promise<void>;
  now(): Date;
}

export interface InboundSmsResult {
  keyword: InboundKeyword;
  /** How many consent rows the keyword actually changed. */
  updated: number;
}

/** Splits rows into the ones needing the push half of the change and the rest. */
function partition<T>(rows: T[], predicate: (row: T) => boolean): [T[], T[]] {
  const yes: T[] = [];
  const no: T[] = [];
  for (const row of rows) (predicate(row) ? yes : no).push(row);
  return [yes, no];
}

/**
 * Matches on the NUMBER, not the user: a number can only be in one consent
 * state, and nothing in the schema stops two accounts consenting with the same
 * one. A STOP from that number must silence every row holding it.
 */
export async function handleInboundSms(
  params: { from: string; body: string | undefined },
  ports: InboundSmsPorts
): Promise<InboundSmsResult> {
  const keyword = classifyKeyword(params.body);

  // HELP is answered by Twilio's Advanced Opt-Out auto-reply. Our only job is
  // to not interfere with it, and never to change consent state.
  if (keyword === 'help' || keyword === 'unknown') {
    return { keyword, updated: 0 };
  }

  const phone = params.from.trim();
  if (!phone) return { keyword, updated: 0 };

  const rows = await ports.findByPhone(phone);
  if (rows.length === 0) return { keyword, updated: 0 };

  if (keyword === 'stop') {
    const now = ports.now();
    // Two updates rather than one, because rows can differ on whether STOP is
    // the actor muting push.
    const [mutesPush, smsOnly] = partition(rows, row => row.upcoming_runs !== false);
    if (mutesPush.length > 0) {
      await ports.applyUpdate(
        mutesPush.map(row => row.id),
        buildStopUpdate(true, now)
      );
    }
    if (smsOnly.length > 0) {
      await ports.applyUpdate(
        smsOnly.map(row => row.id),
        buildStopUpdate(false, now)
      );
    }
    return { keyword, updated: rows.length };
  }

  const revivable = rows.filter(hasIntactConsent);
  if (revivable.length === 0) return { keyword, updated: 0 };

  const [restoresPush, smsOnly] = partition(revivable, row => row.sms_stop_muted_push_at !== null);
  if (restoresPush.length > 0) {
    await ports.applyUpdate(
      restoresPush.map(row => row.id),
      buildStartUpdate(true)
    );
  }
  if (smsOnly.length > 0) {
    await ports.applyUpdate(
      smsOnly.map(row => row.id),
      buildStartUpdate(false)
    );
  }
  return { keyword, updated: revivable.length };
}
