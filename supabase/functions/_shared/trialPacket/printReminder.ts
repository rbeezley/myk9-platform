/**
 * "Saturday's packet is ready — print it and put it in the trial box."
 *
 * MYK9-228 phase 5. Automation can generate a packet and email a link; it
 * cannot put paper in a box, and that is the only step that actually saves a
 * show whose laptop will not boot. So the reminder is not about our plumbing
 * ("please generate a packet" — a chore that reads as our problem and is easy
 * to ignore); it is about the one irreducibly human step, and it has a
 * checkable exit condition.
 *
 * The exit condition is `paperwork_prints`, NEVER the snapshot row. A packet
 * appearing in Storage every night is worth nothing on a dead laptop, and
 * measuring packet existence would show green while the real failure mode
 * stayed wide open.
 */

import { buildSheetDescriptorFromRows } from '../paperwork/rowDescriptors.ts';
import type { PaperworkClassRow, PaperworkEntryRow } from '../paperwork/rowDescriptors.ts';
import { sheetPrintIsCurrent, type SheetPrintRow } from '../paperwork/printState.ts';

export const EMERGENCY_PACKET_REPORT_ID = 'emergency-trial-packet';

/**
 * How long a reminder claim may sit unsent before another run may take it over.
 *
 * Below the 30-minute gap between runs, so every run can rescue what its
 * predecessor abandoned, and comfortably above a healthy send (resolving
 * recipients plus one provider call).
 *
 * `generate-trial-packet` carries its own copy of this shape for the
 * generation claim. Deliberately not shared yet: the two live on independent
 * branches, and a cross-PR import would make whichever merges second the only
 * one that compiles. Worth folding into one helper once both land.
 */
export const REMINDER_CLAIM_LEASE_MS = 10 * 60 * 1000;

export interface ReminderClaimRow {
  claimed_at: string;
  sent_at: string | null;
}

/**
 * A claim row proves a reminder was SENT only when `sent_at` is set.
 * Otherwise the run may have died between the INSERT and the send — resolving
 * recipients is two or three round trips — and treating that as "already
 * reminded" suppresses the slot permanently, which is how a trial day ends up
 * with no paper and no chase.
 */
export function shouldReclaimStaleReminder(row: ReminderClaimRow, now: number): boolean {
  if (row.sent_at) return false;
  const claimedAt = Date.parse(row.claimed_at);
  // An unreadable timestamp must not silence a chase forever. Retrying risks
  // at worst one duplicate email; skipping risks a trial with no paper.
  if (Number.isNaN(claimedAt)) return true;
  return now - claimedAt > REMINDER_CLAIM_LEASE_MS;
}

export type PrintReminderKind = 'evening-before' | 'morning-of';

export function isPrintReminderKind(value: unknown): value is PrintReminderKind {
  return value === 'evening-before' || value === 'morning-of';
}

export interface PrintConfirmationRow {
  report_id: string;
  coverage: unknown;
  voided_at: string | null;
}

/**
 * Whether a non-voided print confirmation covers this trial day.
 *
 * Reads `coverage.trialDate`, which phase 5a made first-class precisely so
 * this question is answerable from SQL. The row's `trial_id` is always NULL
 * for a packet — the artifact is a DAY, and a day may hold several trials, so
 * no `scope_kind` in `paperwork_prints_scope_shape` can express it.
 */
export function packetDayIsPrinted(
  rows: readonly PrintConfirmationRow[],
  trialDate: string,
  /**
   * The packet currently in Storage for this day. A confirmation for an
   * EARLIER snapshot means the box holds paper that tonight's regeneration has
   * superseded — the secretary printed Thursday's copy and Friday's run added
   * the late entries. Going quiet on that is the failure this feature exists
   * to prevent, and the UI model already calls it `stale`. Omit only when the
   * caller genuinely does not know which packet is current.
   */
  currentSnapshotId?: string
): boolean {
  return rows.some(row => {
    if (row.report_id !== EMERGENCY_PACKET_REPORT_ID) return false;
    // A voided confirmation is a retracted claim, not a weaker one.
    if (row.voided_at) return false;
    const coverage = row.coverage;
    if (!coverage || typeof coverage !== 'object' || Array.isArray(coverage)) return false;
    const record = coverage as { trialDate?: unknown; snapshotId?: unknown };
    if (record.trialDate !== trialDate) return false;
    if (currentSnapshotId === undefined) return true;
    return record.snapshotId === currentSnapshotId;
  });
}

/** The two sheets a before-trial packet prints for each class (the app's PACKET_REPORT_IDS). */
const CLASS_SHEET_REPORT_IDS = ['check-in-sheet', 'scoresheet'] as const;

export interface DayClassPrintInput {
  showId: string;
  /** The day's non-cancelled, non-deleted classes. */
  classes: readonly PaperworkClassRow[];
  /** Their entries. */
  entries: readonly PaperworkEntryRow[];
  /** Non-voided check-in-sheet and scoresheet prints for the show. */
  prints: readonly SheetPrintRow[];
}

/**
 * Whether the before-trial packet's own prints cover the day (MYK9-2086 part B).
 *
 * `recordTrialPacketPrint` writes one check-in-sheet and one scoresheet row per class, so the
 * day is printed only when EVERY class that has entries holds a current print of BOTH, judged by
 * the app's own fingerprint code and print-state rule. A class without entries has nothing to
 * print (the app writes no row for it) and is skipped. A day with no printable class is NOT
 * covered here: that is today's behaviour, the emergency day row alone decides.
 */
export function classPrintsCoverDay(input: DayClassPrintInput): boolean {
  let printable = 0;
  for (const classItem of input.classes) {
    if (!classItem.trial_id) return false;
    const scope = {
      kind: 'class' as const,
      showId: input.showId,
      trialId: classItem.trial_id,
      classId: classItem.id,
    };
    for (const reportId of CLASS_SHEET_REPORT_IDS) {
      const descriptor = buildSheetDescriptorFromRows({
        reportId,
        scope,
        classes: input.classes,
        entries: input.entries,
      });
      // The same entries feed both sheets, so a class empty for one is empty for both.
      if (!descriptor) break;
      if (!sheetPrintIsCurrent(input.prints, descriptor)) return false;
      if (reportId === CLASS_SHEET_REPORT_IDS[0]) printable += 1;
    }
  }
  return printable > 0;
}

export type ReminderDecision =
  { remind: true } | { remind: false; reason: 'no-packet' | 'already-printed' };

/**
 * A reminder to print something that does not exist is noise that trains
 * people to ignore the channel. The packet must be there first — which is why
 * this takes the delivered-packet fact as an input rather than assuming it.
 */
export function decidePrintReminder(input: {
  hasDeliveredPacket: boolean;
  confirmations: readonly PrintConfirmationRow[];
  trialDate: string;
  currentSnapshotId?: string;
  /** Current before-trial packet prints cover every class that day. A failed read is `false`. */
  classPrintsCoverDay?: boolean;
}): ReminderDecision {
  if (!input.hasDeliveredPacket) return { remind: false, reason: 'no-packet' };
  if (
    input.classPrintsCoverDay ||
    packetDayIsPrinted(input.confirmations, input.trialDate, input.currentSnapshotId)
  ) {
    return { remind: false, reason: 'already-printed' };
  }
  return { remind: true };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function buildPrintReminderSubject(input: {
  showName: string;
  trialDate: string;
  kind: PrintReminderKind;
}): string {
  return input.kind === 'morning-of'
    ? `Today: print the ${input.showName} packet (${input.trialDate})`
    : `Tonight: print the ${input.showName} packet for ${input.trialDate}`;
}

export function buildPrintReminderEmailHtml(input: {
  showName: string;
  trialDate: string;
  kind: PrintReminderKind;
}): string {
  const showName = escapeHtml(input.showName);
  const trialDate = escapeHtml(input.trialDate);
  // The morning-of send is the last moment this can be acted on, so it says so
  // rather than repeating the evening's wording verbatim.
  const urgency =
    input.kind === 'morning-of'
      ? `<strong>${trialDate} is today.</strong> This is the last chance to print before the trial starts.`
      : `The packet for <strong>${trialDate}</strong> is ready and was emailed to the show team.`;
  return `<!doctype html>
<html lang="en">
  <body style="font-family:Arial,sans-serif;color:#172033;line-height:1.5">
    <h1 style="font-size:22px">${showName} — the packet is not printed yet</h1>
    <div style="border:2px solid #991b1b;background:#fef2f2;padding:16px;margin:18px 0">
      <strong style="font-size:18px;color:#7f1d1d">PRINT IT AND PUT IT IN THE TRIAL BOX.</strong>
      <p style="margin-bottom:0">A PDF in email is not the emergency fallback. The printed packet is. If the laptop will not boot on the morning of ${trialDate}, paper in the box is what runs the trial.</p>
    </div>
    <p>${urgency}</p>
    <p>We are sending this because <strong>nobody has confirmed printing it</strong>. Open the packet email, print it, then use <strong>Mark printed</strong> in myK9 — that is what stops these reminders.</p>
    <p style="color:#475569;font-size:13px">This is about paper, not files. We can generate and email a packet automatically; putting it in the box is the one step we cannot do for you.</p>
  </body>
</html>`;
}
