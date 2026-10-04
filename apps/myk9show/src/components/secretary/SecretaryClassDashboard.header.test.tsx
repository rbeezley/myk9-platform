/**
 * MYK9-984: the secretary class page header named a hard-coded "Interior
 * Novice" class and showed the current clock as "Scheduled". These tests render
 * the page for a NON-Interior class so the placeholder cannot satisfy them.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { mapDatabaseToClass } from '@/services/mappers/classMappers';
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
