import type { ReportDefinition, ReportScopeKind } from '@/lib/reports/types';

/**
 * One sentence per report on why a secretary would reach for it. Keyed by id and
 * checked for completeness against the registry (reportCardCopy.test.ts), so a
 * new report cannot ship as a card with a blank reason.
 */
export const REPORT_WHY: Record<string, string> = {
  'check-in-sheet': 'Paper list for the check-in table, in run order or armband order.',
  scoresheet: 'The sheet a judge records each dog’s run on.',
  'results-sheet': 'Placements and times for a finished class or trial.',
  'show-flyer': 'A flyer for the show to post or send out before entries open.',
  'akc-scent-work-entry-form': 'AKC entry forms filled in from each entry.',
  'akc-scent-work-transfer-form': 'AKC transfer forms for dogs moving between classes.',
  'high-in-trial': 'Which dogs earn High in Trial per level, under AKC rules.',
  'ukc-nosework-entry-form': 'UKC Nosework entry forms filled in from each entry.',
  'ukc-nosework-change-entry-form': 'UKC form for a change to an entry at the trial.',
  'ukc-nosework-judges-book-element': 'UKC judge’s book for an element trial.',
  'ukc-nosework-judges-book-handler-discrimination': 'UKC judge’s book for handler discrimination.',
  'ukc-nosework-trial-score-sheet': 'UKC score sheet for the judge to record runs.',
  'ukc-nosework-trial-report': 'The UKC trial report to send in after the trial.',
  'asca-scent-detection-entry-form': 'ASCA entry forms filled in from each entry.',
  'asca-scent-detection-trial-report': 'The ASCA trial report to send in after the trial.',
  'asca-scent-detection-trial-roster': 'ASCA roster of the dogs running in the trial.',
  'asca-scent-detection-score-sheet': 'ASCA score sheet for the judge to record runs.',
  'asca-scent-detection-gross-receipts': 'ASCA gross receipts report for the trial.',
  'asca-scent-detection-post-event-evaluation': 'ASCA post-event evaluation for the trial.',
  'armband-labels': 'Armband number labels, ready to hand out.',
  'show-catalog': 'The show catalog: every entered dog, by class.',
  'result-catalog': 'The catalog again, with results filled in.',
  'judges-schedule': 'Which judge works which class.',
  'trial-secretary-report': 'The trial secretary’s report to send in after the trial.',
  'judges-certification': 'The judge’s certification page for the trial.',
  'trial-chairman-report': 'The trial chair’s report to send in after the trial.',
  'financial-report': 'Entry fees and payments, whenever you need the money picture.',
  'show-entry-counts': 'How many entries the whole show has.',
  'trial-entry-counts': 'How many entries each trial has.',
  'breed-entry-counts': 'Entries counted by breed.',
  'judge-entry-counts': 'Entries counted by judge.',
  'waitlist-report': 'Who is on a waitlist.',
  'steward-report': 'The steward’s report for the trial.',
  'result-labels': 'Result labels for a finished class.',
  'akc-judge-report': 'The AKC judge’s report for the trial.',
  'trial-secretary-certification': 'The trial secretary’s certification page.',
  'judge-supply-checklist': 'What each judge needs on the table before the first run.',
};

/**
 * Reports the Overview cockpit also offers, per class. Mirrors the `REPORTS`
 * list in `features/show-map/cockpit/buildClassPaperworkMap.ts`; the pairing is
 * pinned by a test so the two cannot drift apart.
 */
export const REPORTS_ALSO_ON_OVERVIEW: ReadonlySet<string> = new Set([
  'check-in-sheet',
  'scoresheet',
  'results-sheet',
  'armband-labels',
  'result-labels',
]);

/**
 * "Whole show", "Per class", "Whole show or per trial", and "... or per dog"
 * when the report filters by dog.
 */
export function describeReportScope(
  report: Pick<ReportDefinition, 'scopes' | 'supportsDogFilter'>
): string {
  const has = (kind: ReportScopeKind) => report.scopes.includes(kind);
  const parts = [
    ...(has('show') ? ['whole show'] : []),
    ...(has('trial') ? ['per trial'] : []),
    ...(has('class') ? ['per class'] : []),
    ...(report.supportsDogFilter ? ['per dog'] : []),
  ];
  const text = parts.join(' or ');
  return `${text[0]?.toUpperCase() ?? ''}${text.slice(1)}`;
}

/** What the secretary does with it: print it, or download the filled-in PDF. */
export function describeReportAction(report: Pick<ReportDefinition, 'pdfOnly'>): string {
  return report.pdfOnly ? 'Download PDF' : 'Print';
}
