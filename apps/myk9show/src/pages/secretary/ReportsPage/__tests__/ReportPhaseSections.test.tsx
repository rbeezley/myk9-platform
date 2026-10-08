import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@/test/utils/testUtils';

import { getReportsForRegistries, reportRegistry } from '@/lib/reports/reportRegistry';
import type { ShowTimePhase } from '@/lib/reports/reportPhaseOrder';
import { buildClassPaperworkMap } from '@/features/show-map/cockpit/buildClassPaperworkMap';

import { PHASE_COPY, ReportPhaseSections } from '../ReportPhaseSections';
import {
  describeReportAction,
  describeReportScope,
  REPORT_WHY,
  REPORTS_ALSO_ON_OVERVIEW,
} from '../reportCardCopy';

// Partial mock: every test but one uses the REAL registry scoping. The empty-phase test swaps
// the return value for one render, to reach a state the live registry cannot produce.
vi.mock('@/lib/reports/reportRegistry', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/reports/reportRegistry')>();
  return { ...actual, getReportsForRegistries: vi.fn(actual.getReportsForRegistries) };
});

const akcTrials = [
  { id: 'trial-1', name: 'Fri 1', trial_number: 'Trial 1', date: '2026-04-12', registry_id: 'AKC' },
  { id: 'trial-2', name: 'Fri 2', trial_number: 'Trial 2', date: '2026-04-12', registry_id: 'AKC' },
];

const defaultProps = {
  reportType: 'check-in-sheet',
  trialId: 'all',
  trials: akcTrials,
  showId: 'show-1',
  onReportTypeChange: vi.fn(),
};

function cardIds(): string[] {
  return screen.getAllByTestId('report-card').map(el => el.getAttribute('data-report-id') ?? '');
}

describe('ReportPhaseSections', () => {
  describe('every enabled report is reachable', () => {
    it('lists each registered report exactly once when the catalog is unscoped', () => {
      render(<ReportPhaseSections {...defaultProps} trials={[]} />);
      const ids = cardIds();
      expect(ids).toHaveLength(reportRegistry.length);
      expect(new Set(ids).size).toBe(reportRegistry.length);
    });

    it('has exactly 37 reports, in the buckets the phase table on MYK9-630 states', () => {
      expect(reportRegistry).toHaveLength(37);
      const sizes = Object.fromEntries(
        (Object.keys(PHASE_COPY) as Array<keyof typeof PHASE_COPY>).map(phase => [
          phase,
          reportRegistry.filter(r => r.phase === phase).length,
        ])
      );
      expect(sizes).toEqual({ before: 13, during: 10, after: 13, anytime: 1 });
    });

    it('reorders without gating: every report is still listed in every show phase', () => {
      for (const phase of ['before', 'during', 'after', 'unknown'] as ShowTimePhase[]) {
        const { unmount } = render(
          <ReportPhaseSections {...defaultProps} trials={[]} showPhase={phase} />
        );
        expect(cardIds(), `phase ${phase}`).toHaveLength(reportRegistry.length);
        unmount();
      }
    });
  });

  describe('section order and the Now marker', () => {
    function headingOrder(): string[] {
      return screen.getAllByRole('heading', { level: 2 }).map(heading => heading.textContent ?? '');
    }

    it.each([
      ['unknown', ['Before the show', 'During the show', 'After the show', 'Anytime']],
      ['before', ['Before the show', 'During the show', 'After the show', 'Anytime']],
      ['during', ['During the show', 'After the show', 'Before the show', 'Anytime']],
      ['after', ['After the show', 'During the show', 'Before the show', 'Anytime']],
    ] as const)('orders sections for a %s show', (phase, expected) => {
      render(<ReportPhaseSections {...defaultProps} showPhase={phase} />);
      expect(headingOrder()).toEqual(expected);
    });

    it.each(['before', 'during', 'after'] as const)('marks only the %s section as Now', phase => {
      render(<ReportPhaseSections {...defaultProps} trials={[]} showPhase={phase} />);
      expect(screen.getAllByText('Now')).toHaveLength(1);
      const section = screen.getByRole('region', { name: PHASE_COPY[phase].label });
      expect(within(section).getByText('Now')).toBeInTheDocument();
    });

    it('marks nothing as Now when the show phase is unknown', () => {
      render(<ReportPhaseSections {...defaultProps} />);
      expect(screen.queryByText('Now')).not.toBeInTheDocument();
    });

    it('puts Check-in Sheet and Score Sheet first on show day', () => {
      render(<ReportPhaseSections {...defaultProps} showPhase="during" />);
      expect(cardIds().slice(0, 2)).toEqual(['check-in-sheet', 'scoresheet']);
    });

    it('renders no section for a phase left empty after registry scoping', () => {
      const mocked = vi.mocked(getReportsForRegistries);
      const realImplementation = mocked.getMockImplementation();
      mocked.mockImplementation(() => reportRegistry.filter(r => r.phase === 'before'));
      try {
        render(<ReportPhaseSections {...defaultProps} />);
        expect(screen.getByRole('region', { name: PHASE_COPY.before.label })).toBeInTheDocument();
        expect(screen.queryByRole('region', { name: PHASE_COPY.during.label })).toBeNull();
        expect(screen.queryByRole('region', { name: PHASE_COPY.after.label })).toBeNull();
        expect(screen.queryByRole('region', { name: PHASE_COPY.anytime.label })).toBeNull();
      } finally {
        if (realImplementation) mocked.mockImplementation(realImplementation);
      }
    });
  });

  describe('registry scoping survives the sections', () => {
    it('shows no UKC or ASCA report anywhere for an AKC-only show', () => {
      render(<ReportPhaseSections {...defaultProps} />);
      const ids = cardIds();
      const foreign = reportRegistry.filter(r => r.registryId === 'UKC' || r.registryId === 'ASCA');
      expect(foreign.length).toBeGreaterThan(0);
      for (const report of foreign) {
        expect(ids, `${report.id} must not appear for an AKC-only show`).not.toContain(report.id);
      }
      expect(ids).toContain('akc-scent-work-entry-form');
      expect(ids).toContain('check-in-sheet');
    });

    it('shows no AKC form for a UKC-only show', () => {
      const ukcTrials = akcTrials.map(t => ({ ...t, registry_id: 'UKC' }));
      render(<ReportPhaseSections {...defaultProps} trials={ukcTrials} />);
      const ids = cardIds();
      const akc = reportRegistry.filter(r => r.registryId === 'AKC');
      expect(akc.length).toBeGreaterThan(0);
      for (const report of akc) {
        expect(ids, `${report.id} must not appear for a UKC-only show`).not.toContain(report.id);
      }
      expect(ids).toContain('ukc-nosework-entry-form');
    });

    it('fails open to the full catalog when no trials are loaded', () => {
      render(<ReportPhaseSections {...defaultProps} trials={[]} />);
      expect(cardIds()).toHaveLength(reportRegistry.length);
    });

    it('fails open to the full catalog when a trial carries an unknown registry value', () => {
      render(
        <ReportPhaseSections
          {...defaultProps}
          trials={[{ ...akcTrials[0]!, registry_id: 'NOT-A-REGISTRY' }]}
        />
      );
      expect(cardIds()).toHaveLength(reportRegistry.length);
    });

    it('keeps a deep-linked out-of-scope report listed', () => {
      render(<ReportPhaseSections {...defaultProps} reportType="ukc-nosework-entry-form" />);
      const ids = cardIds();
      expect(ids).toContain('ukc-nosework-entry-form');
      expect(ids).not.toContain('asca-scent-detection-entry-form');
    });
  });

  describe('cards', () => {
    it('shows name, scope, reason and action for a report', () => {
      render(<ReportPhaseSections {...defaultProps} trials={[]} />);
      const card = document.querySelector('[data-report-id="check-in-sheet"]') as HTMLElement;
      expect(within(card).getByText('Check-in Sheet')).toBeInTheDocument();
      expect(within(card).getByText('Per trial or per class')).toBeInTheDocument();
      expect(within(card).getByText(REPORT_WHY['check-in-sheet']!)).toBeInTheDocument();
      expect(within(card).getByTestId('report-card-action')).toHaveTextContent('Print');
    });

    it('offers Download PDF, not Print, for a download-only registry form', () => {
      render(<ReportPhaseSections {...defaultProps} trials={[]} />);
      const card = document.querySelector(
        '[data-report-id="ukc-nosework-change-entry-form"]'
      ) as HTMLElement;
      expect(within(card).getByTestId('report-card-action')).toHaveTextContent('Download PDF');
    });

    it('shows a status chip only for reports that have one', () => {
      render(
        <ReportPhaseSections
          {...defaultProps}
          printChips={{ 'check-in-sheet': { label: '3 of 8 printed', tone: 'warning' } }}
        />
      );
      const chips = screen.getAllByTestId('report-card-status');
      expect(chips).toHaveLength(1);
      expect(chips[0]).toHaveTextContent('3 of 8 printed');
      const card = document.querySelector('[data-report-id="check-in-sheet"]') as HTMLElement;
      expect(within(card).getByTestId('report-card-status')).toBe(chips[0]);
    });

    it('links to Overview exactly the reports the Overview offers', () => {
      render(<ReportPhaseSections {...defaultProps} trials={[]} />);
      const linked = screen
        .getAllByTestId('report-card')
        .filter(el => within(el).queryByRole('link', { name: 'Also on Overview, per class' }))
        .map(el => el.getAttribute('data-report-id'));
      expect(new Set(linked)).toEqual(REPORTS_ALSO_ON_OVERVIEW);
    });

    it('omits the Overview link when the show is not known', () => {
      render(<ReportPhaseSections {...defaultProps} showId={undefined} />);
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });

    it('selects a report when its card is pressed', async () => {
      const onReportTypeChange = vi.fn();
      const { default: userEvent } = await import('@testing-library/user-event');
      const user = userEvent.setup();
      render(<ReportPhaseSections {...defaultProps} onReportTypeChange={onReportTypeChange} />);
      const card = document.querySelector('[data-report-id="results-sheet"]') as HTMLElement;
      await user.click(within(card).getByText('Results Sheet'));
      expect(onReportTypeChange).toHaveBeenCalledWith('results-sheet');
    });
  });
});

describe('report card copy', () => {
  it('has a reason for every registered report and none for a report that does not exist', () => {
    const ids = reportRegistry.map(r => r.id).sort();
    expect(Object.keys(REPORT_WHY).sort()).toEqual(ids);
    for (const text of Object.values(REPORT_WHY)) expect(text.trim().length).toBeGreaterThan(10);
  });

  it('describes scope in words', () => {
    expect(describeReportScope({ scopes: ['show'] })).toBe('Whole show');
    expect(describeReportScope({ scopes: ['trial'] })).toBe('Per trial');
    expect(describeReportScope({ scopes: ['show', 'trial'], supportsDogFilter: true })).toBe(
      'Whole show or per trial or per dog'
    );
  });

  it('names the action by how the report is delivered', () => {
    expect(describeReportAction({ pdfOnly: true })).toBe('Download PDF');
    expect(describeReportAction({})).toBe('Print');
  });

  it('claims on Overview exactly the reports its class paperwork offers', () => {
    // Behavior, not source text: build the Overview's per-class paperwork for a class that has
    // an entry, and read which reports it offers.
    const classRow = {
      id: 'class-1',
      trial_id: 'trial-1',
      element: 'Buried',
      level: 'Novice',
      section: '',
      status: 'scheduled',
      judge_name: 'Pat',
    };
    const entry = {
      id: 'entry-1',
      class_id: 'class-1',
      dog_id: 'dog-1',
      armband: 101,
      run_order: 1,
      check_in_status: 'checked-in',
      result_status: null,
      final_placement: null,
      search_time_seconds: null,
      total_faults: null,
      dog: { call_name: 'Star' },
      handler_person: { first_name: 'Sarah', last_name: 'Johnson' },
    };
    const map = buildClassPaperworkMap({
      showId: 'show-1',
      classes: [classRow] as never,
      trials: [{ id: 'trial-1', trialDate: '2026-04-12' }],
      entries: [entry] as never,
      records: [],
      returnTo: '/shows/show-1',
    });
    const offered = (map.get('class-1') ?? []).map(item => item.reportId);
    expect(new Set(offered)).toEqual(REPORTS_ALSO_ON_OVERVIEW);
  });
});

describe('report registry names', () => {
  // Pinned so a copy-pasted name (MYK9-1033 audited for this) reds here. Each name below was
  // checked against the report's own title in its component.
  const EXPECTED_NAMES: Record<string, string> = {
    'check-in-sheet': 'Check-in Sheet',
    scoresheet: 'Score Sheet',
    'results-sheet': 'Results Sheet',
    'show-flyer': 'Show Flyer',
    'akc-scent-work-entry-form': 'AKC Scent Work Entry Form',
    'akc-scent-work-transfer-form': 'AKC Scent Work Transfer Form',
    'high-in-trial': 'AKC High in Trial',
    'ukc-nosework-entry-form': 'UKC Nosework Entry Form',
    'ukc-nosework-change-entry-form': 'UKC Nosework Change Entry Form',
    'ukc-nosework-judges-book-element': 'UKC Nosework Judges Book: Element Trial',
    'ukc-nosework-judges-book-handler-discrimination':
      'UKC Nosework Judges Book: Handler Discrimination',
    'ukc-nosework-trial-score-sheet': 'UKC Nosework Trial Score Sheet',
    'ukc-nosework-trial-report': 'UKC Nosework Trial Report',
    'asca-scent-detection-entry-form': 'ASCA Scent Detection Entry Form',
    'asca-scent-detection-trial-report': 'ASCA Scent Detection Trial Report',
    'asca-scent-detection-trial-roster': 'ASCA Scent Detection Trial Roster',
    'asca-scent-detection-score-sheet': 'ASCA Scent Detection Score Sheet',
    'asca-scent-detection-gross-receipts': 'ASCA Scent Detection Gross Receipts Report',
    'asca-scent-detection-post-event-evaluation': 'ASCA Scent Detection Post-Event Evaluation',
    'armband-labels': 'Armband Labels',
    'show-catalog': 'Show Catalog',
    'result-catalog': 'Result Catalog',
    'judges-schedule': "Judge's Schedule",
    'trial-secretary-report': 'AKC Trial Secretary Report',
    'judges-certification': "AKC Judge's Certification Report",
    'trial-chairman-report': 'AKC Trial Chairman Report',
    'financial-report': 'Financial Report',
    'show-entry-counts': 'Show Entry Counts',
    'trial-entry-counts': 'Trial Entry Counts',
    'breed-entry-counts': 'Breed Entry Counts',
    'judge-entry-counts': 'Judge Entry Counts',
    'waitlist-report': 'Waitlist Report',
    'steward-report': "Steward's Report",
    'result-labels': 'Result Labels',
    'akc-judge-report': "AKC Judge's Report",
    'trial-secretary-certification': 'AKC Trial Secretary Certification',
    'judge-supply-checklist': 'Judge Supply Checklists',
  };

  it('gives every report its own name', () => {
    expect(Object.fromEntries(reportRegistry.map(r => [r.id, r.name]))).toEqual(EXPECTED_NAMES);
  });

  it('never repeats a name', () => {
    const names = reportRegistry.map(r => r.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
