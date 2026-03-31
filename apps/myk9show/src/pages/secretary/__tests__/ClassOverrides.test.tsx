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
import { ClassOverrides } from '../ResultsControlPage/ClassOverrides';

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

const classOverrideWithCheckin: ClassOverrideEntry[] = [
  {
    classId: 'class-1',
    trialId: 'trial-1',
    override: {},
    selfCheckinEnabled: false,
  },
];

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

// ─── New ClassOverrides component tests ───────────────────────────────────────

const newTrials: SyncableTrial[] = [
  {
    id: 'trial-1',
    name: 'Trial A',
    showId: 'show-1',
    _version: 1,
    _lastModified: new Date(),
    _lastModifiedBy: '',
    _syncStatus: 'synced',
  } as SyncableTrial,
];

const newClasses: SyncableClassData[] = [
  {
    id: 'class-1',
    trialId: 'trial-1',
    element: 'Standard',
    level: 'Novice',
  } as SyncableClassData,
  {
    id: 'class-2',
    trialId: 'trial-1',
    element: 'Standard',
    level: 'Open',
  } as SyncableClassData,
];

function renderClassOverridesComponent(overrides?: {
  selectedClasses?: Set<string>;
  onToggleClass?: (id: string) => void;
  onToggleAllInTrial?: (trialId: string, classIds: string[]) => void;
}) {
  const selectedClasses = overrides?.selectedClasses ?? new Set<string>();
  return render(
    <ClassOverrides
      showId="show-1"
      trials={newTrials}
      classes={newClasses}
      classOverrides={[]}
      trialOverrides={[]}
      selectedClasses={selectedClasses}
      onToggleClass={overrides?.onToggleClass ?? vi.fn()}
      onToggleAllInTrial={overrides?.onToggleAllInTrial ?? vi.fn()}
    />
  );
}

describe('ClassOverrides', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders class names grouped by trial', async () => {
    const { user } = renderClassOverridesComponent();
    // Expand the trial collapsible
    await user.click(screen.getByRole('button', { name: /trial a/i }));
    expect(screen.getByText(/novice/i)).toBeInTheDocument();
    expect(screen.getByText(/open/i)).toBeInTheDocument();
  });

  it('calls onToggleClass when checkbox is clicked', async () => {
    const onToggle = vi.fn();
    const { user } = renderClassOverridesComponent({ onToggleClass: onToggle });
    await user.click(screen.getByRole('button', { name: /trial a/i }));
    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[1]); // first class checkbox (index 0 is select-all)
    expect(onToggle).toHaveBeenCalledWith('class-1');
  });

  it('calls onToggleAllInTrial when select-all checkbox is clicked', async () => {
    const onToggleAll = vi.fn();
    const { user } = renderClassOverridesComponent({ onToggleAllInTrial: onToggleAll });
    await user.click(screen.getByRole('button', { name: /trial a/i }));
    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[0]); // select-all checkbox
    expect(onToggleAll).toHaveBeenCalledWith('trial-1', ['class-1', 'class-2']);
  });
});
