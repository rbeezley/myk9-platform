import { Link } from 'react-router-dom';
import { Download, Printer } from 'lucide-react';

import { cn } from '@/lib/utils';
import { getReportsForRegistries } from '@/lib/reports/reportRegistry';
import { orderReportPhases, type ShowTimePhase } from '@/lib/reports/reportPhaseOrder';
import type { ReportDefinition, ReportPhase } from '@/lib/reports/types';
import { ALL_DAYS, getShowHomeHref } from '@/features/show-map/cockpit/cockpitRoutes';

import type { ReportPrintChip } from './buildReportPrintChips';
import {
  REPORT_WHY,
  REPORTS_ALSO_ON_OVERVIEW,
  describeReportAction,
  describeReportScope,
} from './reportCardCopy';
import { getScopedRegistryIds, type TrialReportOption } from './reportScopedRegistries';

/**
 * The heading and one-line description for each phase. `Record<ReportPhase, …>` is
 * the exhaustiveness guard the picker's label map carried: adding a phase to the
 * `ReportPhase` union without extending this fails TypeScript, which prevents the
 * kind of silent omission that hid Financial + Statistics for several weeks (fixed
 * 2026-04-26).
 *
 * The render iterates this object's own keys (see `resolvePhaseOrder`), not a
 * hand-written order array, so a phase cannot be rendered-but-unordered or
 * ordered-but-unlisted.
 */
export const PHASE_COPY: Record<ReportPhase, { label: string; hint: string }> = {
  before: {
    label: 'Before the show',
    hint: 'From when entries close to the morning of the show.',
  },
  during: { label: 'During the show', hint: 'While classes are in the ring.' },
  after: { label: 'After the show', hint: 'Once a class is scored, and at wrap-up.' },
  anytime: { label: 'Anytime', hint: 'Useful at any point.' },
};

/**
 * Every phase, in the order `orderReportPhases` leaves them for this show.
 * Intersected with `PHASE_COPY`'s keys so the two can never drift: a phase the
 * ordering forgets still renders (at the end), and one `PHASE_COPY` lacks cannot.
 */
export function resolvePhaseOrder(showPhase: ShowTimePhase): ReportPhase[] {
  const known = Object.keys(PHASE_COPY) as ReportPhase[];
  const ordered = orderReportPhases(showPhase).filter(phase => known.includes(phase));
  return [...ordered, ...known.filter(phase => !ordered.includes(phase))];
}

const CHIP_TONE: Record<ReportPrintChip['tone'], string> = {
  done: 'border-success/30 bg-success/10 text-success',
  warning: 'border-warning/30 bg-warning/10 text-warning',
  neutral: 'border-border bg-muted/40 text-muted-foreground',
};

interface ReportPhaseSectionsProps {
  reportType: string;
  trialId: string;
  trials: TrialReportOption[];
  showId: string | undefined;
  /**
   * Where the show sits relative to today. Orders the sections nearest-in-time
   * first and puts the "Now" chip on the matching one; `'unknown'` gives the plain
   * before/during/after order with no chip. NOTHING is gated by it.
   */
  showPhase?: ShowTimePhase | undefined;
  /** Print status by report id; a report with no entry shows no status. */
  printChips?: Record<string, ReportPrintChip> | undefined;
  onReportTypeChange: (value: string) => void;
}

function ReportCard({
  report,
  selected,
  chip,
  showId,
  onSelect,
}: {
  report: ReportDefinition;
  selected: boolean;
  chip: ReportPrintChip | undefined;
  showId: string | undefined;
  onSelect: (id: string) => void;
}) {
  const action = describeReportAction(report);
  const ActionIcon = report.pdfOnly ? Download : Printer;
  return (
    <li
      data-testid="report-card"
      data-report-id={report.id}
      className={cn(
        'flex flex-col gap-2 rounded-lg border p-3',
        selected ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'bg-card'
      )}
    >
      <button
        type="button"
        aria-pressed={selected}
        disabled={!report.enabled}
        onClick={() => onSelect(report.id)}
        className="min-h-[44px] min-w-0 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
      >
        <span className="block font-medium">
          {report.name}
          {!report.enabled ? ' (Coming Soon)' : ''}
        </span>
        <span className="block text-xs font-medium text-muted-foreground">
          {describeReportScope(report)}
        </span>
        <span className="mt-1 block text-sm text-muted-foreground">{REPORT_WHY[report.id]}</span>
      </button>
      <div className="flex flex-wrap items-center gap-2">
        {chip && (
          <span
            data-testid="report-card-status"
            className={cn(
              'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
              CHIP_TONE[chip.tone]
            )}
          >
            {chip.label}
          </span>
        )}
        {/* A label, not a second button: Print and Download live in the controls bar below and
            act on whichever card is selected. A card button named "Print" that only selected
            the card would be a promise the click does not keep. */}
        <span
          data-testid="report-card-action"
          className="ml-auto inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground"
        >
          <ActionIcon className="h-4 w-4" aria-hidden="true" />
          {action}
        </span>
      </div>
      {showId && REPORTS_ALSO_ON_OVERVIEW.has(report.id) && (
        <Link
          to={getShowHomeHref({ showId, state: { selectedDay: ALL_DAYS, filter: 'all' } })}
          className="text-xs font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          Also on Overview, per class
        </Link>
      )}
    </li>
  );
}

/**
 * The report catalog as visible sections, one per show phase, current phase first.
 * Replaces the grouped report dropdown: the same registry-scoped list and the same
 * phase membership, shown rather than hidden behind a menu.
 */
export function ReportPhaseSections({
  reportType,
  trialId,
  trials,
  showId,
  showPhase = 'unknown',
  printChips,
  onReportTypeChange,
}: ReportPhaseSectionsProps) {
  // Scope first, then group, so a UKC-only show never sees an AKC form under any
  // heading. A deep-linked out-of-scope report stays listed so the page can show it.
  const visibleReports = getReportsForRegistries(getScopedRegistryIds(trials, trialId), reportType);
  const phases = resolvePhaseOrder(showPhase).filter(phase =>
    visibleReports.some(report => report.phase === phase)
  );

  return (
    <div className="mb-6 grid gap-6 lg:grid-cols-3" data-testid="report-phase-sections">
      {phases.map(phase => {
        const headingId = `report-phase-${phase}`;
        const isNow = phase === showPhase;
        return (
          <section
            key={phase}
            aria-labelledby={headingId}
            className={cn(phase === 'anytime' && 'lg:col-span-3')}
          >
            <div className="mb-2 flex items-center gap-2">
              <h2 id={headingId} className="text-base font-semibold">
                {PHASE_COPY[phase].label}
              </h2>
              {isNow && (
                <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                  Now
                </span>
              )}
            </div>
            <p className="mb-3 text-sm text-muted-foreground">{PHASE_COPY[phase].hint}</p>
            <ul
              className={cn(
                'flex flex-col gap-3',
                phase === 'anytime' && 'lg:grid lg:grid-cols-3 lg:gap-3'
              )}
            >
              {visibleReports
                .filter(report => report.phase === phase)
                .map(report => (
                  <ReportCard
                    key={report.id}
                    report={report}
                    selected={report.id === reportType}
                    chip={printChips?.[report.id]}
                    showId={showId}
                    onSelect={onReportTypeChange}
                  />
                ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
