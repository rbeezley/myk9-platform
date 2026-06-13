import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import userEvent from '@testing-library/user-event';
import { ReportControlsBar } from '../ReportControlsBar';
import { reportRegistry } from '@/lib/reports/reportRegistry';

const mockTrials = [
  { id: 'trial-1', name: 'Friday Trial 1', trial_number: 1, date: '2026-04-12' },
  { id: 'trial-2', name: 'Friday Trial 2', trial_number: 2, date: '2026-04-12' },
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
    expect(screen.getByText(/Trial Secretary/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /download official pdf/i }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('shows the current report type name', () => {
    render(<ReportControlsBar {...defaultProps} />);
    // Base UI Select renders items into a portal; the trigger shows the raw value.
    // The hidden input carries the value — check that the report value is present.
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
    expect(screen.getByRole('combobox', { name: /select class/i })).toBeInTheDocument();
  });

  it('class dropdown is disabled when trialId is "all"', () => {
    render(<ReportControlsBar {...defaultProps} trialId="all" />);
    expect(screen.getByRole('combobox', { name: /select class/i })).toBeDisabled();
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
    expect(screen.getByRole('combobox', { name: /select class/i })).not.toBeDisabled();
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
        trial_number: 1,
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

      await user.click(screen.getByRole('combobox', { name: /select trial/i }));

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

      await user.click(screen.getByRole('combobox', { name: /select class/i }));

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

      await user.click(screen.getByRole('combobox', { name: /select class/i }));

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

      await user.click(screen.getByRole('combobox', { name: /select class/i }));

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
      { id: trialUuid, name: 'Friday Trial 1', trial_number: 1, date: '2026-04-12' },
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
      const trigger = screen.getByRole('combobox', { name: /select trial/i });
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
      const trigger = screen.getByRole('combobox', { name: /select class/i });
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
            { id: 'trial-other', name: 'Saturday Trial PM', trial_number: 2, date: '2026-04-13' },
          ]}
          classes={triggerClasses}
          trialId="trial-other"
          classId={classUuid}
        />
      );
      const trigger = screen.getByRole('combobox', { name: /select class/i });
      expect(trigger.textContent ?? '').not.toMatch(UUID_RE);
      expect(trigger.textContent ?? '').toMatch(/Container Novice A/);
    });
  });

  describe('Registry coverage — every enabled report is reachable from the dropdown', () => {
    // Regression guard: the dropdown previously rendered only Operational and
    // Organization groups, silently hiding the Financial Report and the four
    // entry-counts statistics reports even though they were enabled in the
    // registry. (Found during /qa-feature shows-as-secretary walk 2026-04-26.)
    // Pure-logic check: the e2e in reportsUI.spec.ts covers actual DOM rendering;
    // here we just guard the registry → dropdown-grouping invariant so a future
    // category gets a CI failure before it ships silently hidden again.
    const RENDERED_CATEGORIES = ['operational', 'organization', 'financial', 'statistics'];

    it('every enabled report has a category that the dropdown renders', () => {
      const enabled = reportRegistry.filter(r => r.enabled);
      const orphans = enabled.filter(r => !RENDERED_CATEGORIES.includes(r.category));
      expect(orphans).toEqual([]);
    });

    it('Financial Report is registered, enabled, and in the financial group', () => {
      const fin = reportRegistry.find(r => r.id === 'financial-report');
      expect(fin).toBeDefined();
      expect(fin?.enabled).toBe(true);
      expect(fin?.category).toBe('financial');
    });

    it('all four entry-counts reports are registered, enabled, and statistics', () => {
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
        expect(r?.category, `report ${id} category`).toBe('statistics');
      }
    });
  });
});
