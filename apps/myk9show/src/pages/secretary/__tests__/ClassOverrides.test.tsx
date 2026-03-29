import { screen, within } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { vi } from 'vitest';
import type {
  ShowSettings,
  TrialOverrideEntry,
  ClassOverrideEntry,
} from '@/hooks/queries/useShowSettingsDatabase';
import type { SyncableTrial } from '@/store/trial-store-types';
import type { SyncableClassData } from '@/store/classStore';

// Mock mutations
const mockUpdateClassOverride = { mutate: vi.fn(), isPending: false };
const mockResetOverride = { mutate: vi.fn(), isPending: false };
const mockUpdateShowVisibility = { mutate: vi.fn(), isPending: false };
const mockUpdateTrialOverride = { mutate: vi.fn(), isPending: false };
const mockUpdateShowCheckin = { mutate: vi.fn(), isPending: false };

vi.mock('@/hooks/mutations/useShowSettingsMutations', () => ({
  useUpdateShowVisibility: () => mockUpdateShowVisibility,
  useUpdateTrialOverride: () => mockUpdateTrialOverride,
  useUpdateClassOverride: () => mockUpdateClassOverride,
  useResetOverride: () => mockResetOverride,
  useUpdateShowCheckin: () => mockUpdateShowCheckin,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// Test fixtures
const mockSettings: ShowSettings = {
  visibility: {
    placement: 'class_complete',
    qualification: 'immediate',
    time: 'class_complete',
    faults: 'class_complete',
    preset: 'standard',
    inheritedFrom: 'show',
  },
  selfCheckinEnabled: true,
  hasExplicitSettings: true,
};

const mockTrials: SyncableTrial[] = [
  {
    id: 'trial-1',
    showId: 'show-1',
    name: 'Saturday Trial 1',
    _version: 1,
    _lastModified: new Date(),
    _lastModifiedBy: 'test',
    _syncStatus: 'synced',
  } as SyncableTrial,
];

const mockClasses: SyncableClassData[] = [
  {
    id: 'class-1',
    trialId: 'trial-1',
    trial: 'Saturday Trial 1',
    trialDate: '2026-05-09',
    trialNumber: '1',
    classOrder: '1',
    status: 'Scheduled',
    judge: 'Judge Smith',
    element: 'Container',
    level: 'Novice',
    section: 'A',
    _version: 1,
    _lastModified: new Date(),
    _lastModifiedBy: 'test',
    _syncStatus: 'synced',
  } as SyncableClassData,
  {
    id: 'class-2',
    trialId: 'trial-1',
    trial: 'Saturday Trial 1',
    trialDate: '2026-05-09',
    trialNumber: '1',
    classOrder: '2',
    status: 'Scheduled',
    judge: 'Judge Smith',
    element: 'Interior',
    level: 'Advanced',
    _version: 1,
    _lastModified: new Date(),
    _lastModifiedBy: 'test',
    _syncStatus: 'synced',
  } as SyncableClassData,
];

const emptyTrialOverrides: TrialOverrideEntry[] = [];
const emptyClassOverrides: ClassOverrideEntry[] = [];

const classOverrideWithPreset: ClassOverrideEntry[] = [
  {
    classId: 'class-1',
    trialId: 'trial-1',
    override: { preset: 'open' },
    selfCheckinEnabled: null,
  },
];

const classOverrideWithCheckin: ClassOverrideEntry[] = [
  {
    classId: 'class-1',
    trialId: 'trial-1',
    override: {},
    selfCheckinEnabled: false,
  },
];

describe('ResultsVisibilitySection — Class Overrides', () => {
  let ResultsVisibilitySection: typeof import('../ShowSettingsPage/ResultsVisibilitySection').ResultsVisibilitySection;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../ShowSettingsPage/ResultsVisibilitySection');
    ResultsVisibilitySection = mod.ResultsVisibilitySection;
  });

  it('renders class overrides section with trial grouping', () => {
    render(
      <ResultsVisibilitySection
        showId="show-1"
        settings={mockSettings}
        trialOverrides={emptyTrialOverrides}
        classOverrides={emptyClassOverrides}
        trials={mockTrials}
        classes={mockClasses}
      />
    );

    expect(screen.getByText('Class Overrides')).toBeInTheDocument();
    // The collapsible trigger button contains "Saturday Trial 1" as a span
    expect(screen.getByRole('button', { name: /Saturday Trial 1.*classes/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /2 classes/ })).toBeInTheDocument();
  });

  it('shows class names from element/level/section after expanding', async () => {
    const { user } = render(
      <ResultsVisibilitySection
        showId="show-1"
        settings={mockSettings}
        trialOverrides={emptyTrialOverrides}
        classOverrides={emptyClassOverrides}
        trials={mockTrials}
        classes={mockClasses}
      />
    );

    // Expand the trial collapsible — target the button role for the class-overrides trigger
    await user.click(screen.getByRole('button', { name: /Saturday Trial 1.*classes/ }));

    expect(screen.getByText('Container Novice A')).toBeInTheDocument();
    expect(screen.getByText('Interior Advanced')).toBeInTheDocument();
  });

  it('shows override indicator when class has visibility override', async () => {
    const { user } = render(
      <ResultsVisibilitySection
        showId="show-1"
        settings={mockSettings}
        trialOverrides={emptyTrialOverrides}
        classOverrides={classOverrideWithPreset}
        trials={mockTrials}
        classes={mockClasses}
      />
    );

    expect(screen.getByText(/1 overridden/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Saturday Trial 1.*classes/ }));

    expect(screen.getByText('Override: open')).toBeInTheDocument();
    // class-2 has no override and no trial override, so it shows "Inheriting from show"
    expect(screen.getAllByText('Inheriting from show').length).toBeGreaterThanOrEqual(1);
  });

  it('shows reset button only for overridden classes', async () => {
    const { user } = render(
      <ResultsVisibilitySection
        showId="show-1"
        settings={mockSettings}
        trialOverrides={emptyTrialOverrides}
        classOverrides={classOverrideWithPreset}
        trials={mockTrials}
        classes={mockClasses}
      />
    );

    await user.click(screen.getByRole('button', { name: /Saturday Trial 1.*classes/ }));

    // Only class-1 has override, so only 1 reset button in class section
    const resetButtons = screen.getAllByTitle('Reset to inherited settings');
    expect(resetButtons.length).toBe(1);
  });

  it('calls resetOverride with level class on reset click', async () => {
    const { user } = render(
      <ResultsVisibilitySection
        showId="show-1"
        settings={mockSettings}
        trialOverrides={emptyTrialOverrides}
        classOverrides={classOverrideWithPreset}
        trials={mockTrials}
        classes={mockClasses}
      />
    );

    await user.click(screen.getByRole('button', { name: /Saturday Trial 1.*classes/ }));

    const resetButton = screen.getByTitle('Reset to inherited settings');
    await user.click(resetButton);

    expect(mockResetOverride.mutate).toHaveBeenCalledWith(
      { entityId: 'class-1', showId: 'show-1', level: 'class' },
      expect.any(Object)
    );
  });
});

describe('SelfCheckinSection — Class Overrides', () => {
  let SelfCheckinSection: typeof import('../ShowSettingsPage/SelfCheckinSection').SelfCheckinSection;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../ShowSettingsPage/SelfCheckinSection');
    SelfCheckinSection = mod.SelfCheckinSection;
  });

  it('renders class check-in overrides grouped by trial', () => {
    render(
      <SelfCheckinSection
        showId="show-1"
        settings={mockSettings}
        trialOverrides={emptyTrialOverrides}
        classOverrides={emptyClassOverrides}
        trials={mockTrials}
        classes={mockClasses}
      />
    );

    expect(screen.getByText('Class Overrides')).toBeInTheDocument();
  });

  it('shows override indicator for class with check-in override', async () => {
    const { user } = render(
      <SelfCheckinSection
        showId="show-1"
        settings={mockSettings}
        trialOverrides={emptyTrialOverrides}
        classOverrides={classOverrideWithCheckin}
        trials={mockTrials}
        classes={mockClasses}
      />
    );

    expect(screen.getByText(/1 overridden/)).toBeInTheDocument();

    // Target the collapsible trigger button in the Class Overrides section
    await user.click(screen.getByRole('button', { name: /Saturday Trial 1.*classes/ }));

    expect(screen.getByText('Override active')).toBeInTheDocument();
  });

  it('calls useUpdateClassOverride on check-in toggle', async () => {
    const { user } = render(
      <SelfCheckinSection
        showId="show-1"
        settings={mockSettings}
        trialOverrides={emptyTrialOverrides}
        classOverrides={emptyClassOverrides}
        trials={mockTrials}
        classes={mockClasses}
      />
    );

    // Expand the class overrides collapsible
    await user.click(screen.getByRole('button', { name: /Saturday Trial 1.*classes/ }));

    // Find the first class row and its switch — show-level switch is checked, class switch inherits
    // The first class row contains "Container Novice A"
    const classRow = screen.getByText('Container Novice A').closest('[class*="rounded-md"]')!;
    const switchEl = within(classRow).getByRole('switch');
    await user.click(switchEl);

    expect(mockUpdateClassOverride.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        classId: 'class-1',
        trialId: 'trial-1',
        showId: 'show-1',
        selfCheckinEnabled: false,
      }),
      expect.any(Object)
    );
  });
});
