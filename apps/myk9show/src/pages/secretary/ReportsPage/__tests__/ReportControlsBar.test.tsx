import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import userEvent from '@testing-library/user-event';
import { ReportControlsBar } from '../ReportControlsBar';
import { getReportsForRegistries, reportRegistry } from '@/lib/reports/reportRegistry';
import type { ReportPhase } from '@/lib/reports/types';
import type { ShowTimePhase } from '@/lib/reports/reportPhaseOrder';

// Partial mock: every test uses the REAL registry scoping. Only the
// empty-phase-group test swaps the return value for one render, to reach a
// state the live 37-entry registry cannot produce on its own.
vi.mock('@/lib/reports/reportRegistry', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/reports/reportRegistry')>();
  return { ...actual, getReportsForRegistries: vi.fn(actual.getReportsForRegistries) };
});

const PHASE_LABELS: Record<ReportPhase, string> = {
  before: 'Before the show',
  during: 'During the show',
  after: 'After the show',
  anytime: 'Anytime',
};

const mockTrials = [
  { id: 'trial-1', name: 'Friday Trial 1', trial_number: 'Trial 1', date: '2026-04-12' },
  { id: 'trial-2', name: 'Friday Trial 2', trial_number: 'Trial 2', date: '2026-04-12' },
];

const mockClasses = [
  {
    id: 'class-1',
    name: 'Buried Novice',
    element: 'Buried',
    level: 'Novice',
    section: '',
    trial_id: 'trial-1',
  },
  {
    id: 'class-2',
    name: 'Interior Advanced',
    element: 'Interior',
    level: 'Advanced',
    section: '',
    trial_id: 'trial-1',
  },
];

const defaultProps = {
  reportType: 'check-in-sheet',
  trialId: 'all',
  classId: 'all',
  dogId: 'all',
  sortOrder: 'run-order',
  trials: mockTrials,
  classes: mockClasses,
  dogs: [],
  onReportTypeChange: vi.fn(),
  onTrialChange: vi.fn(),
  onClassChange: vi.fn(),
  onDogChange: vi.fn(),
  onSortChange: vi.fn(),
  onPrint: vi.fn(),
};

describe('ReportControlsBar', () => {
  it('renders Print button', () => {
    render(<ReportControlsBar {...defaultProps} />);
    expect(screen.getByRole('button', { name: /print/i })).toBeInTheDocument();
  });

  it('uses phone-width controls with desktop fixed widths restored at sm', () => {
    render(<ReportControlsBar {...defaultProps} />);

    const reportTrigger = screen.getByRole('combobox', { name: /^report$/i });
    expect(reportTrigger.className).toContain('w-full');
    expect(reportTrigger.className).toContain('sm:w-[200px]');
    expect(screen.getByRole('button', { name: /print/i }).className).toContain('w-full');
  });

  it('does not render the official PDF action for regular reports', () => {
    render(<ReportControlsBar {...defaultProps} />);
    expect(screen.queryByRole('button', { name: /official pdf/i })).not.toBeInTheDocument();
  });

  it('disables the official PDF action until one trial is selected', () => {
    render(
      <ReportControlsBar
        {...defaultProps}
        reportType="trial-secretary-report"
        officialPdfAction={{
          disabled: true,
          isLoading: false,
          label: 'Select trial for official PDF',
          onClick: vi.fn(),
        }}
      />
    );

    expect(screen.getByRole('button', { name: /select trial for official pdf/i })).toBeDisabled();
  });

  it('runs the official PDF action when enabled', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <ReportControlsBar
        {...defaultProps}
        reportType="trial-secretary-report"
        trialId="trial-1"
        officialPdfAction={{
          disabled: false,
          isLoading: false,
          label: 'Download official PDF',
          onClick,
        }}
      />
    );

    await user.click(screen.getByRole('button', { name: /download official pdf/i }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('shows missing official PDF fields without blocking download', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <ReportControlsBar
        {...defaultProps}
        reportType="trial-secretary-report"
        trialId="trial-1"
        officialPdfAction={{
          disabled: false,
          isLoading: false,
          label: 'Download official PDF',
          missingFieldLabels: ['Trial Secretary'],
          onClick,
        }}
      />
    );

    expect(screen.getByRole('status')).toHaveTextContent('Official PDF needs a quick review');
    expect(screen.getByText('Official PDF needs a quick review')).toBeInTheDocument();
    // Scope to the alert: the report-type trigger now also shows the human label
    // "AKC Trial Secretary Report" (F5), so a document-wide /Trial Secretary/
    // query would match two nodes.
    expect(screen.getByRole('status')).toHaveTextContent(/Trial Secretary/);
    // MYK9-661: the trigger names the registry whose paperwork this is.
    expect(screen.getByText('AKC Trial Secretary Report')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /download official pdf/i }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('shows the current report type name', () => {
    render(<ReportControlsBar {...defaultProps} />);
    // Base UI Select renders items into a portal; the hidden input carries the
    // value while the trigger shows the human label (see the F5 block below).
    const hiddenInputs = document.querySelectorAll('input[aria-hidden="true"]');
    const reportInput = Array.from(hiddenInputs).find(
      el => (el as HTMLInputElement).value === 'check-in-sheet'
    );
    expect(reportInput).toBeTruthy();
  });

  it('shows All Trials text', () => {
    render(<ReportControlsBar {...defaultProps} />);
    // The trial trigger shows the raw value "all" in its span; the hidden input confirms it.
    const hiddenInputs = document.querySelectorAll('input[aria-hidden="true"]');
    const trialInput = Array.from(hiddenInputs).find(
      el => (el as HTMLInputElement).value === 'all'
    );
    expect(trialInput).toBeTruthy();
    // The label "Trial" is visible
    expect(screen.getByText('Trial')).toBeInTheDocument();
  });

  it('shows All Classes text', () => {
    render(<ReportControlsBar {...defaultProps} />);
    // The "Class" label is visible, confirming the class dropdown is rendered
    expect(screen.getByText('Class')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /^class$/i })).toBeInTheDocument();
  });

  it('class dropdown is disabled when trialId is "all"', () => {
    render(<ReportControlsBar {...defaultProps} trialId="all" />);
    expect(screen.getByRole('combobox', { name: /^class$/i })).toBeDisabled();
  });

  it('shows class scope for result catalog deep links', () => {
    render(
      <ReportControlsBar
        {...defaultProps}
        reportType="result-catalog"
        trialId="trial-1"
        classId="class-1"
      />
    );

    expect(screen.getByText('Class')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /^class$/i })).not.toBeDisabled();
  });

  // Regression: TO-DOS 2026-06-09. The Trial/Class option labels were built from
  // nullable element/level/section/trial_number columns; when those were empty the
  // SelectItem label collapsed and shadcn echoed the raw UUID `value`. Labels must
  // render human names while the option `value` stays the UUID (filter logic keys
  // off it). UUID shape: 8-4-4-4-12 hex.
  const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

  describe('Trial/Class option labels show human names, not UUIDs', () => {
    const uuidTrials = [
      {
        id: '874be7e4-b187-4c11-9a3b-0000000000aa',
        name: 'Friday Trial 1',
        trial_number: 'Trial 1',
        date: '2026-04-12',
      },
    ];
    const uuidClasses = [
      {
        id: '10e39f5f-ef3d-4673-b62c-0000000000bb',
        name: 'Container Novice A',
        element: 'Container',
        level: 'Novice',
        section: 'A',
        trial_id: '874be7e4-b187-4c11-9a3b-0000000000aa',
      },
    ];

    it('renders the trial name (not its UUID) as the option label', async () => {
      const user = userEvent.setup();
      render(
        <ReportControlsBar
          {...defaultProps}
          trials={uuidTrials}
          classes={uuidClasses}
          trialId="all"
        />
      );

      await user.click(screen.getByRole('combobox', { name: /^trial$/i }));

      const option = await screen.findByText(/Friday Trial 1/);
      expect(option).toBeInTheDocument();
      // The matched option's label shows the human name and carries no raw UUID.
      expect(option.textContent ?? '').not.toMatch(UUID_RE);
    });

    it('renders the class element/level/section (not its UUID) as the option label', async () => {
      const user = userEvent.setup();
      render(
        <ReportControlsBar
          {...defaultProps}
          trials={uuidTrials}
          classes={uuidClasses}
          trialId="874be7e4-b187-4c11-9a3b-0000000000aa"
        />
      );

      await user.click(screen.getByRole('combobox', { name: /^class$/i }));

      const option = await screen.findByText(/Container Novice A/);
      expect(option).toBeInTheDocument();
      expect(option.textContent ?? '').not.toMatch(UUID_RE);
    });

    it('falls back to the class name when element/level/section are empty', async () => {
      const user = userEvent.setup();
      render(
        <ReportControlsBar
          {...defaultProps}
          trials={uuidTrials}
          classes={[
            {
              id: '10e39f5f-ef3d-4673-b62c-0000000000cc',
              name: 'Detective Class',
              element: '',
              level: '',
              section: '',
              trial_id: '874be7e4-b187-4c11-9a3b-0000000000aa',
            },
          ]}
          trialId="874be7e4-b187-4c11-9a3b-0000000000aa"
        />
      );

      await user.click(screen.getByRole('combobox', { name: /^class$/i }));

      const option = await screen.findByText(/Detective Class/);
      expect(option).toBeInTheDocument();
      expect(option.textContent ?? '').not.toMatch(UUID_RE);
    });

    it('falls back to a generic label (never the UUID) when name AND element/level/section are all empty', async () => {
      const user = userEvent.setup();
      render(
        <ReportControlsBar
          {...defaultProps}
          trials={uuidTrials}
          classes={[
            {
              id: '10e39f5f-ef3d-4673-b62c-0000000000dd',
              name: '',
              element: '',
              level: '',
              section: '',
              trial_id: '874be7e4-b187-4c11-9a3b-0000000000aa',
            },
          ]}
          trialId="874be7e4-b187-4c11-9a3b-0000000000aa"
        />
      );

      await user.click(screen.getByRole('combobox', { name: /^class$/i }));

      // Query by option role (not text) so we don't collide with the "Class" <label>.
      const option = await screen.findByRole('option', { name: 'Class' });
      expect(option).toBeInTheDocument();
      expect(option.textContent ?? '').not.toMatch(UUID_RE);
    });
  });

  // Regression: the collapsed Select TRIGGER (not just the open option list) must
  // show the human label. Base UI's SelectValue echoes the raw `value` when it
  // cannot resolve the selected item to a label, so the trial/class triggers
  // printed the UUID once a specific trial/class was selected (the 2026-06-09 fix
  // only corrected the open option list). ReportControlsBar now feeds SelectValue
  // an explicit computed label so the UUID never reaches the trigger.
  describe('Collapsed trigger shows the selected name, never the UUID', () => {
    const trialUuid = '874be7e4-b187-4c11-9a3b-0000000000aa';
    const classUuid = '10e39f5f-ef3d-4673-b62c-0000000000bb';
    const triggerTrials = [
      { id: trialUuid, name: 'Friday Trial 1', trial_number: 'Trial 1', date: '2026-04-12' },
    ];
    const triggerClasses = [
      {
        id: classUuid,
        name: 'Container Novice A',
        element: 'Container',
        level: 'Novice',
        section: 'A',
        trial_id: trialUuid,
      },
    ];

    it('shows the selected trial name in the trial trigger', () => {
      render(
        <ReportControlsBar
          {...defaultProps}
          reportType="result-catalog"
          trials={triggerTrials}
          classes={triggerClasses}
          trialId={trialUuid}
        />
      );
      const trigger = screen.getByRole('combobox', { name: /^trial$/i });
      expect(trigger.textContent ?? '').toMatch(/Friday Trial 1/);
      expect(trigger.textContent ?? '').not.toMatch(UUID_RE);
    });

    it('shows the selected class name in the class trigger', () => {
      render(
        <ReportControlsBar
          {...defaultProps}
          reportType="result-catalog"
          trials={triggerTrials}
          classes={triggerClasses}
          trialId={trialUuid}
          classId={classUuid}
        />
      );
      const trigger = screen.getByRole('combobox', { name: /^class$/i });
      expect(trigger.textContent ?? '').toMatch(/Container Novice A/);
      expect(trigger.textContent ?? '').not.toMatch(UUID_RE);
    });

    it('resolves the class label even when the class is filtered out of the option list', () => {
      // classId points to a class whose trial_id !== the selected trial, so it is
      // filtered OUT of the rendered options — the exact case where Base UI would
      // otherwise echo the UUID. The label still resolves from the full class list.
      render(
        <ReportControlsBar
          {...defaultProps}
          reportType="result-catalog"
          trials={[
            ...triggerTrials,
            {
              id: 'trial-other',
              name: 'Saturday Trial PM',
              trial_number: 'Trial 2',
              date: '2026-04-13',
            },
          ]}
          classes={triggerClasses}
          trialId="trial-other"
          classId={classUuid}
        />
      );
      const trigger = screen.getByRole('combobox', { name: /^class$/i });
      expect(trigger.textContent ?? '').not.toMatch(UUID_RE);
      expect(trigger.textContent ?? '').toMatch(/Container Novice A/);
    });
  });

  // Regression (F5, Lane 1.2 secretary re-walk 2026-06-17): the report-type and
  // sort triggers echoed their raw kebab-case option ids (`check-in-sheet`,
  // `run-order`) instead of the human label, the same Base UI SelectValue echo
  // the trial/class triggers had. These option ids are not UUIDs, so the prior
  // UUID guard didn't catch them — assert the human label shows and the raw id
  // does not.
  describe('Report-type and sort triggers show human labels, not raw ids (F5)', () => {
    it('shows the report name in the report-type trigger, not its id', () => {
      render(<ReportControlsBar {...defaultProps} reportType="check-in-sheet" />);
      const trigger = screen.getByRole('combobox', { name: /^report$/i });
      expect(trigger.textContent ?? '').toMatch(/Check-in Sheet/);
      expect(trigger.textContent ?? '').not.toMatch(/check-in-sheet/);
    });

    it('shows the sort label in the sort trigger, not its value', () => {
      // check-in-sheet exposes the run-order sort options, so the Sort dropdown
      // renders with sortOrder="run-order" selected.
      render(
        <ReportControlsBar {...defaultProps} reportType="check-in-sheet" sortOrder="run-order" />
      );
      const trigger = screen.getByRole('combobox', { name: /^sort$/i });
      expect(trigger.textContent ?? '').toMatch(/Run Order/);
      expect(trigger.textContent ?? '').not.toMatch(/run-order/);
    });
  });

  describe('Show-phase grouping — every enabled report is reachable from the dropdown', () => {
    // Regression guard (rewritten from the category-group version): the dropdown
    // previously rendered only Operational and Organization groups, silently
    // hiding the Financial Report and the four entry-counts statistics reports
    // even though they were enabled in the registry. (Found during /qa-feature
    // shows-as-secretary walk 2026-04-26.) The grouping key is now the show
    // phase, so the same omission would drop a whole phase's reports.
    const RENDERED_PHASES: readonly ReportPhase[] = ['before', 'during', 'after', 'anytime'];

    async function openReportDropdown() {
      const user = userEvent.setup();
      await user.click(screen.getByRole('combobox', { name: /^report$/i }));
      const options = await screen.findAllByRole('option');
      return options.map(o => (o.textContent ?? '').trim());
    }

    it('every enabled report has a phase that the dropdown renders', () => {
      const enabled = reportRegistry.filter(r => r.enabled);
      const orphans = enabled.filter(r => !RENDERED_PHASES.includes(r.phase));
      expect(orphans).toEqual([]);
    });

    it('has exactly 37 reports, in the buckets the phase table on MYK9-630 states', () => {
      // Pins the COUNT, which the sum-equals-length assertion never did: that
      // one is an identity over a total partition and is true of any
      // assignment. Richard corrects this table on the issue; these numbers and
      // that comment must agree, so a silent re-bucketing reds here.
      expect(reportRegistry).toHaveLength(37);
      const sizes = Object.fromEntries(
        (Object.keys(PHASE_LABELS) as ReportPhase[]).map(phase => [
          phase,
          reportRegistry.filter(r => r.phase === phase).length,
        ])
      );
      expect(sizes).toEqual({ before: 13, during: 10, after: 13, anytime: 1 });
    });

    it('lists all 37 reports exactly once across the four phase groups', async () => {
      render(<ReportControlsBar {...defaultProps} />);
      const optionNames = await openReportDropdown();

      expect(optionNames).toHaveLength(reportRegistry.length);
      for (const report of reportRegistry) {
        expect(
          optionNames.filter(name => name === report.name),
          `${report.id} should be listed exactly once`
        ).toHaveLength(1);
      }
    });

    async function renderedHeadingOrder(showPhase?: ShowTimePhase): Promise<string[]> {
      render(
        <ReportControlsBar {...defaultProps} {...(showPhase === undefined ? {} : { showPhase })} />
      );
      await openReportDropdown();
      // Read the ORDER off the DOM, never off the constant that produced it:
      // find each heading by its own text, then sort by document position.
      const headings = Object.values(PHASE_LABELS).map(label => screen.getByText(label));
      return [...headings]
        .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
        .map(el => el.textContent ?? '');
    }

    it('defaults to plain show order when the show phase is not supplied', async () => {
      expect(await renderedHeadingOrder()).toEqual([
        PHASE_LABELS.before,
        PHASE_LABELS.during,
        PHASE_LABELS.after,
        PHASE_LABELS.anytime,
      ]);
    });

    it('leads with During the show while the show is running', async () => {
      // The show-day cost the regroup would otherwise have shipped silently:
      // `before` is the largest bucket, so a fixed order pushed Check-in Sheet
      // and Score Sheet from positions 1-2 to 12-13 (REV-2341 P2-Q2).
      expect(await renderedHeadingOrder('during')).toEqual([
        PHASE_LABELS.during,
        PHASE_LABELS.after,
        PHASE_LABELS.before,
        PHASE_LABELS.anytime,
      ]);
    });

    it('leads with After the show once it is over', async () => {
      expect(await renderedHeadingOrder('after')).toEqual([
        PHASE_LABELS.after,
        PHASE_LABELS.during,
        PHASE_LABELS.before,
        PHASE_LABELS.anytime,
      ]);
    });

    it('puts Check-in Sheet and Score Sheet first on show day', async () => {
      render(<ReportControlsBar {...defaultProps} showPhase="during" />);
      const optionNames = await openReportDropdown();

      expect(optionNames.slice(0, 2)).toEqual(['Check-in Sheet', 'Score Sheet']);
    });

    it('reorders without gating: all 37 are still listed in every phase state', async () => {
      for (const phase of ['before', 'during', 'after', 'unknown'] as const) {
        const { unmount } = render(<ReportControlsBar {...defaultProps} showPhase={phase} />);
        const optionNames = await openReportDropdown();
        expect(optionNames, `phase ${phase}`).toHaveLength(reportRegistry.length);
        unmount();
      }
    });

    it('lists before-the-show reports with no show-status input at all', async () => {
      // There is no status prop to pass: grouping is headings only, so a
      // completed show still offers the pre-show paperwork.
      expect(Object.keys(defaultProps)).not.toContain('showStatus');
      render(<ReportControlsBar {...defaultProps} />);
      const optionNames = await openReportDropdown();

      expect(optionNames).toContain('Show Flyer');
      expect(optionNames).toContain('Waitlist Report');
      expect(optionNames).toContain("Judge's Schedule");
    });

    it('Financial Report is registered, enabled, and grouped as anytime', () => {
      const fin = reportRegistry.find(r => r.id === 'financial-report');
      expect(fin).toBeDefined();
      expect(fin?.enabled).toBe(true);
      expect(fin?.phase).toBe('anytime');
    });

    it('all four entry-counts reports are registered, enabled, and before-the-show', () => {
      const ids = [
        'show-entry-counts',
        'trial-entry-counts',
        'breed-entry-counts',
        'judge-entry-counts',
      ];
      for (const id of ids) {
        const r = reportRegistry.find(x => x.id === id);
        expect(r, `report ${id}`).toBeDefined();
        expect(r?.enabled, `report ${id} enabled`).toBe(true);
        expect(r?.phase, `report ${id} phase`).toBe('before');
      }
    });
  });

  describe('Registry scoping survives the phase grouping', () => {
    const akcTrials = [
      {
        id: 'trial-1',
        name: 'Friday Trial 1',
        trial_number: 'Trial 1',
        date: '2026-04-12',
        registry_id: 'AKC',
      },
      {
        id: 'trial-2',
        name: 'Friday Trial 2',
        trial_number: 'Trial 2',
        date: '2026-04-12',
        registry_id: 'AKC',
      },
    ];

    async function openReportDropdown() {
      const user = userEvent.setup();
      await user.click(screen.getByRole('combobox', { name: /^report$/i }));
      const options = await screen.findAllByRole('option');
      return options.map(o => (o.textContent ?? '').trim());
    }

    it('shows no UKC or ASCA report under any heading for an AKC-only show', async () => {
      render(<ReportControlsBar {...defaultProps} trials={akcTrials} />);
      const optionNames = await openReportDropdown();

      const foreign = reportRegistry.filter(r => r.registryId === 'UKC' || r.registryId === 'ASCA');
      expect(foreign.length).toBeGreaterThan(0);
      for (const report of foreign) {
        expect(optionNames, `${report.id} must not appear for an AKC-only show`).not.toContain(
          report.name
        );
      }
      expect(optionNames).toContain('AKC Scent Work Entry Form');
      expect(optionNames).toContain('Check-in Sheet');
    });

    it('fails open to the full catalog when no trials are loaded', async () => {
      render(<ReportControlsBar {...defaultProps} trials={[]} />);
      const optionNames = await openReportDropdown();

      expect(optionNames).toHaveLength(reportRegistry.length);
      expect(optionNames).toContain('UKC Nosework Entry Form');
      expect(optionNames).toContain('ASCA Scent Detection Entry Form');
    });

    it('fails open to the full catalog when a trial carries an unknown registry value', async () => {
      render(
        <ReportControlsBar
          {...defaultProps}
          trials={[{ ...akcTrials[0], registry_id: 'NOT-A-REGISTRY' }]}
        />
      );
      const optionNames = await openReportDropdown();

      expect(optionNames).toHaveLength(reportRegistry.length);
      expect(optionNames).toContain('UKC Nosework Entry Form');
    });

    it('keeps a deep-linked out-of-scope report listed', async () => {
      render(
        <ReportControlsBar
          {...defaultProps}
          reportType="ukc-nosework-entry-form"
          trials={akcTrials}
        />
      );
      const optionNames = await openReportDropdown();

      expect(optionNames).toContain('UKC Nosework Entry Form');
      expect(optionNames).not.toContain('ASCA Scent Detection Entry Form');
    });

    it('renders no heading for a phase left empty after registry scoping', async () => {
      const mocked = vi.mocked(getReportsForRegistries);
      const realImplementation = mocked.getMockImplementation();
      const beforeOnly = reportRegistry.filter(r => r.phase === 'before');
      expect(beforeOnly.length).toBeGreaterThan(0);
      mocked.mockImplementation(() => beforeOnly);

      try {
        const user = userEvent.setup();
        render(<ReportControlsBar {...defaultProps} />);
        await user.click(screen.getByRole('combobox', { name: /^report$/i }));

        expect(await screen.findByText(PHASE_LABELS.before)).toBeInTheDocument();
        expect(screen.queryByText(PHASE_LABELS.during)).not.toBeInTheDocument();
        expect(screen.queryByText(PHASE_LABELS.after)).not.toBeInTheDocument();
        expect(screen.queryByText(PHASE_LABELS.anytime)).not.toBeInTheDocument();
      } finally {
        if (realImplementation) mocked.mockImplementation(realImplementation);
      }
    });
  });
});
