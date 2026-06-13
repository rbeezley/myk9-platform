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
  incidentReportableCount: number;
  // Lunch + water reminders still pending across all tracked judges.
  hospitalityReminderCount: number;
  // Open ("todo") tasks scoped to this show.
  tasksOpenCount: number;
}

// 'urgent' → alarming (red) glance; reserved for reportable/urgent incidents.
// 'routine' → ambient signal for hospitality reminders + open tasks. Keeping
// routine work out of the alarming tone preserves the calm Show Desk feel.
export type ShowDeskActionableTone = 'urgent' | 'routine';

export interface ShowDeskActionable {
  count: number;
  tone: ShowDeskActionableTone;
}

export function computeShowDeskActionable(
  signals: ShowDeskActionableSignals
): ShowDeskActionable {
  const count =
    signals.incidentReportableCount +
    signals.hospitalityReminderCount +
    signals.tasksOpenCount;

  // Only a reportable/urgent incident warrants the alarming tone. Routine
  // reminders and open tasks still produce a count, but stay ambient.
  const tone: ShowDeskActionableTone =
    signals.incidentReportableCount > 0 ? 'urgent' : 'routine';

  return { count, tone };
}
