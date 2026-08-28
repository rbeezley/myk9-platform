// INTENT: The Show Desk Tools sheet is closed by default. Its trigger badge is
// the secretary's only "is anything waiting?" glance while the wrench is shut.
// Historically only the incident card's attention surfaced here; hospitality
// reminders and open tasks were computed INSIDE their cards and stayed
// invisible until the sheet was opened — defeating the calm "everything is
// handled" read. This module is the single, pure source of truth that
// aggregates every attention-worthy tool into one count + tone so the trigger
// can show a combined, ambient signal.

export interface ShowDeskActionableSignals {
  // Reportable + urgent incidents. (summarizeShowIncidents.reportableCount
  // already includes urgent, so this is the full attention-worthy incident
  // total — do not also add urgentCount or it double-counts.)
  // `null` = the incidents read did not succeed, so this is UNKNOWN.
  incidentReportableCount: number | null;
  // Lunch + water reminders still pending across all tracked judges. Read from
  // localStorage, so it is always known, even offline.
  hospitalityReminderCount: number;
  // Open ("todo") tasks scoped to this show. `null` = the read did not succeed.
  tasksOpenCount: number | null;
}

// 'urgent' → alarming (red) glance; reserved for reportable/urgent incidents.
// 'routine' → ambient signal for hospitality reminders + open tasks. Keeping
// routine work out of the alarming tone preserves the calm Show Desk feel.
export type ShowDeskActionableTone = 'urgent' | 'routine';

export interface ShowDeskActionable {
  count: number;
  tone: ShowDeskActionableTone;
  /**
   * At least one input could not be read, so `count` is a FLOOR, not a total.
   *
   * This matters more here than almost anywhere else on the page. The badge is
   * the secretary's only "is anything waiting?" glance while the wrench is
   * shut, and the incidents and tasks queries both pause offline. Summing
   * unknowns as zero produced a calm, idle badge during exactly the crisis this
   * signal exists to surface -- an urgent incident logged by a steward could
   * not raise it, because its count was `[]`.
   */
  incomplete: boolean;
}

export function computeShowDeskActionable(
  signals: ShowDeskActionableSignals
): ShowDeskActionable {
  const incomplete =
    signals.incidentReportableCount === null || signals.tasksOpenCount === null;

  // Sum only what was actually read. An unread source contributes nothing to
  // the count and instead sets `incomplete`, so the caller can distinguish
  // "nothing is waiting" from "I could not find out".
  const count =
    (signals.incidentReportableCount ?? 0) +
    signals.hospitalityReminderCount +
    (signals.tasksOpenCount ?? 0);

  // Only a reportable/urgent incident warrants the alarming tone. Routine
  // reminders and open tasks still produce a count, but stay ambient.
  const tone: ShowDeskActionableTone =
    (signals.incidentReportableCount ?? 0) > 0 ? 'urgent' : 'routine';

  return { count, tone, incomplete };
}
