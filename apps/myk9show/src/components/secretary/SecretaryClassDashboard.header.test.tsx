/**
 * MYK9-984: the secretary class page header named a hard-coded "Interior
 * Novice" class and showed the current clock as "Scheduled". These tests render
 * the page for a NON-Interior class so the placeholder cannot satisfy them.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { mapDatabaseToClass, mapReplicatedClassToDbRow } from '@/services/mappers/classMappers';
import type { ReplicatedClass } from '@/services/replication/ReplicatedClassesTable';
import type { DbClassWithRelations } from '@/services/mappers/classMappers';
import { SecretaryClassDashboard } from './SecretaryClassDashboard';
import { secretaryClassScheduledLabel } from './SecretaryClassDashboard.header';

const CLASS_ID = 'class-ext-excellent';

const mocks = vi.hoisted(() => ({
  classes: [] as unknown[],
}));

vi.mock('react-router-dom', async importOriginal => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useParams: () => ({ showId: 'show-1', trialId: 'trial-1', classId: 'class-ext-excellent' }),
}));
vi.mock('@/hooks/useClassStoreCompat', () => ({
  useClassStoreCompat: () => ({ classes: mocks.classes }),
}));
vi.mock('@/store/trialStore', () => ({
  useTrialStore: () => ({
    trials: [{ id: 'trial-1', trialType: 'Regular', timezone: 'America/Chicago' }],
  }),
}));
vi.mock('@/store/showStore', () => ({
  useShowStore: () => ({ shows: [{ id: 'show-1', organization: 'AKC Scent Work' }] }),
}));
vi.mock('@/store/entryStore', () => ({ useEntryStore: () => ({ updateResult: vi.fn() }) }));
vi.mock('@/hooks/useAuthContext', () => ({ useAuthContext: () => ({ user: null }) }));
vi.mock('@/hooks/useFilteredEntries', () => ({ useEntriesByClass: () => [] }));
vi.mock('@/hooks/useBreadcrumb', () => ({ useBreadcrumb: () => [] }));
vi.mock('@/hooks/queries/useClassScentWorkEntries', () => ({
  useClassScentWorkEntries: () => ({ entries: [], dbCount: 0, localCount: 0 }),
}));
vi.mock('@/hooks/queries/useShowSettingsDatabase', () => ({
  useClassEffectiveSettings: () => ({ data: null, isLoading: false }),
}));
vi.mock('./BulkResultEntry', () => ({ BulkResultEntry: () => null }));
vi.mock('./PlacementCalculator', () => ({ PlacementCalculator: () => null }));
vi.mock('./SettingsOverrideCard', () => ({ SettingsOverrideCard: () => null }));

/** A class row shaped like the demo show's Exterior Excellent (no start_time). */
function exteriorExcellent(overrides: Record<string, unknown> = {}) {
  return mapDatabaseToClass({
    id: CLASS_ID,
    trial_id: 'trial-1',
    name: 'Exterior Excellent',
    element: 'Exterior',
    level: 'Excellent',
    section: null,
    status: 'scheduled',
    start_time: null,
    revised_expected_start: null,
    trial: { id: 'trial-1', name: 'Saturday', date: '2026-10-10', trial_number: '1' },
    judge_assignments: [{ person_id: 'j1', people: { first_name: 'Pat', last_name: 'Donovan' } }],
    ...overrides,
  } as unknown as DbClassWithRelations);
}

describe('SecretaryClassDashboard header (MYK9-984)', () => {
  beforeEach(() => {
    mocks.classes = [exteriorExcellent()];
  });

  it('names the real class, not the hard-coded Interior Novice placeholder', () => {
    render(<SecretaryClassDashboard />);

    expect(screen.getAllByText('Exterior Excellent').length).toBeGreaterThan(0);
    expect(screen.getByText(/Exterior Excellent • .*Judge: Pat Donovan/)).toBeInTheDocument();
    expect(screen.queryByText(/Interior Novice/)).not.toBeInTheDocument();
  });

  it('shows the revised expected start in the trial time zone when start_time is null', () => {
    // 12:30Z on Oct 10 is 7:30 AM in America/Chicago (CDT).
    mocks.classes = [exteriorExcellent({ revised_expected_start: '2026-10-10T12:30:00.000Z' })];
    render(<SecretaryClassDashboard />);

    expect(screen.getByText('Scheduled').nextElementSibling).toHaveTextContent('7:30 AM');
  });

  it('prefers the planned start_time over the revised expected start', () => {
    mocks.classes = [
      exteriorExcellent({
        start_time: '09:00:00',
        revised_expected_start: '2026-10-10T12:30:00.000Z',
      }),
    ];
    render(<SecretaryClassDashboard />);

    expect(screen.getByText('Scheduled').nextElementSibling).toHaveTextContent('9:00 AM');
  });

  it('shows an em dash, never the current clock, when the class has no time at all', () => {
    render(<SecretaryClassDashboard />);

    expect(screen.getByText('Scheduled').nextElementSibling).toHaveTextContent('—');
  });
});

/** The value cell beside a Class Details label. */
const valueOf = (label: string) => screen.getByText(label).nextElementSibling;

describe('SecretaryClassDashboard placeholders (MYK9-984)', () => {
  beforeEach(() => {
    mocks.classes = [exteriorExcellent()];
  });

  it('shows the real judge, and no ring, in the subtitle', () => {
    render(<SecretaryClassDashboard />);

    const subtitle = screen.getByText(/Exterior Excellent • /);
    expect(subtitle).toHaveTextContent('Exterior Excellent • Judge: Pat Donovan');
    expect(subtitle).not.toHaveTextContent(/ring/i);
  });

  it('says "Judge TBD", never a made-up name, when no judge is assigned', () => {
    mocks.classes = [exteriorExcellent({ judge_assignments: [] })];
    render(<SecretaryClassDashboard />);

    expect(screen.getByText(/Exterior Excellent • Judge TBD/)).toBeInTheDocument();
    expect(screen.queryByText(/Jane Doe/)).not.toBeInTheDocument();
  });

  it('reads the time limit and areas from the class row', () => {
    mocks.classes = [
      exteriorExcellent({
        time_limit_seconds: 270,
        time_limit_area2_seconds: 300,
        num_areas: 2,
      }),
    ];
    render(<SecretaryClassDashboard />);

    expect(valueOf('Time Limit')).toHaveTextContent('4:30');
    expect(valueOf('Multi-Area')).toHaveTextContent('Yes');
  });

  it('shows "Not set" for an unset limit and drops Multi-Area when the class has not said', () => {
    render(<SecretaryClassDashboard />);

    expect(valueOf('Time Limit')).toHaveTextContent('Not set');
    expect(screen.queryByText('Multi-Area')).not.toBeInTheDocument();
  });

  it('reads a single-area class as not multi-area', () => {
    mocks.classes = [exteriorExcellent({ time_limit_seconds: 180, num_areas: 1 })];
    render(<SecretaryClassDashboard />);

    expect(valueOf('Time Limit')).toHaveTextContent('3:00');
    expect(valueOf('Multi-Area')).toHaveTextContent('No');
  });

  it('keeps the revised start on the replicated (authenticated) read path', () => {
    const replicated = {
      id: CLASS_ID,
      trialId: 'trial-1',
      name: 'Exterior Excellent',
      element: 'Exterior',
      level: 'Excellent',
      revisedExpectedStart: '2026-10-10T12:30:00.000Z',
      classStatus: 'scheduled',
    } as unknown as ReplicatedClass;
    mocks.classes = [
      mapDatabaseToClass(mapReplicatedClassToDbRow(replicated) as unknown as DbClassWithRelations),
    ];
    render(<SecretaryClassDashboard />);

    expect(valueOf('Scheduled')).toHaveTextContent('7:30 AM');
  });
});

describe('secretaryClassScheduledLabel', () => {
  it('falls through start, revised, then an em dash', () => {
    expect(secretaryClassScheduledLabel({ startTime: '8:15 AM' }, 'UTC')).toBe('8:15 AM');
    expect(
      secretaryClassScheduledLabel({ revisedExpectedStart: '2026-10-10T12:30:00.000Z' }, 'UTC')
    ).toBe('12:30 PM');
    expect(secretaryClassScheduledLabel({ startTime: '' }, 'UTC')).toBe('—');
    expect(secretaryClassScheduledLabel(null, 'UTC')).toBe('—');
  });
});
