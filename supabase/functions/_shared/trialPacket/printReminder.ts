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

export const EMERGENCY_PACKET_REPORT_ID = 'emergency-trial-packet';

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

export type ReminderDecision =
  | { remind: true }
  | { remind: false; reason: 'no-packet' | 'already-printed' };

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
}): ReminderDecision {
  if (!input.hasDeliveredPacket) return { remind: false, reason: 'no-packet' };
  if (packetDayIsPrinted(input.confirmations, input.trialDate, input.currentSnapshotId)) {
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
