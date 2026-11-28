// An operator alert about a condition that can clear on its own closes itself
// when the condition clears (MYK9-2540, extending MYK9-2182's payout reminder).
// Deno-free; `alertAdmin.ts` supplies the service-role store.
//
// Two kinds of alert (the screens read the difference, MYK9-2538):
//   * live: about something still true right now (a club's payouts are off, a
//     refund waits for approval). The code that sees the condition clear
//     resolves it, so a person never has to, and the screen can offer a button
//     that opens the thing instead of Resolve. `detail.lifecycle` is 'live'
//     and `detail.live_subject` names the thing.
//   * one-off: a record of something that happened. No `lifecycle` key; a
//     person reads it and presses Resolve. Every older alert is this kind.

/** `detail.lifecycle` on a live alert. Absent on a one-off alert. */
export const LIVE_ALERT_LIFECYCLE = 'live';

/** What a live alert is about, for the screen's "open it" button. */
export type LiveAlertSubject =
  | { kind: 'club_payments'; club_id: string }
  | { kind: 'refund_request'; refund_request_id: string };

/** The `detail` keys that mark an alert live. Spread into the alert's detail. */
export function liveAlertDetail(subject: LiveAlertSubject): {
  lifecycle: typeof LIVE_ALERT_LIFECYCLE;
  live_subject: LiveAlertSubject;
} {
  return { lifecycle: LIVE_ALERT_LIFECYCLE, live_subject: subject };
}

/** Which open alerts to resolve: one exact key, or every key with a prefix. */
export type AlertMatch = { dedupeKey: string } | { dedupeKeyPrefix: string };

export interface OpenAlertRow {
  id: string;
  detail: Record<string, unknown> | null;
}

export interface AlertResolveStore {
  /** Unresolved rows of `source` matching `match`. Throws when the read fails. */
  findOpen: (source: string, match: AlertMatch) => Promise<OpenAlertRow[]>;
  /** Resolve one row only while it is still unresolved; true when it was. Throws on failure. */
  resolve: (id: string, resolvedAt: string, detail: Record<string, unknown>) => Promise<boolean>;
}

/**
 * Resolve every open alert of `source` that `match` selects, recording `note`
 * as `detail.resolution_note` (the rest of the detail is kept). resolved_by
 * stays null: the system closed it. Returns how many rows it resolved; a row
 * a person resolved in between is not counted. Throws when the store does.
 */
export async function resolveOperatorAlertsWith(
  store: AlertResolveStore,
  input: { source: string; match: AlertMatch; note: string; now: Date }
): Promise<number> {
  const rows = await store.findOpen(input.source, input.match);
  const resolvedAt = input.now.toISOString();
  let resolved = 0;
  for (const row of rows) {
    const detail = { ...(row.detail ?? {}), resolution_note: input.note };
    if (await store.resolve(row.id, resolvedAt, detail)) resolved += 1;
  }
  return resolved;
}

/** A LIKE pattern matching keys that start with `prefix`, wildcards escaped. */
export function dedupeKeyPrefixPattern(prefix: string): string {
  return `${prefix.replace(/[\\%_]/g, ch => `\\${ch}`)}%`;
}
