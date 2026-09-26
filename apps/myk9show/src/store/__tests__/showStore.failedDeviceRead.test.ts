import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockShowsTable, mockClubsTable, mockJudgeAssignmentsTable } = vi.hoisted(() => ({
  mockShowsTable: { getAllWithStatus: vi.fn(), subscribe: vi.fn() },
  mockClubsTable: { getAllWithStatus: vi.fn(), subscribe: vi.fn() },
  mockJudgeAssignmentsTable: { getAllWithStatus: vi.fn(), subscribe: vi.fn() },
}));

vi.mock('@/services/replication', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/replication')>()),
  replicatedShowsTable: mockShowsTable,
  replicatedJudgeAssignmentsTable: mockJudgeAssignmentsTable,
}));
vi.mock('@/services/replication/ReplicatedClubsTable', () => ({
  replicatedClubsTable: mockClubsTable,
}));
vi.mock('@/services/replication/ReplicatedJudgeAssignmentsTable', () => ({
  replicatedJudgeAssignmentsTable: mockJudgeAssignmentsTable,
}));
vi.mock('@/config/dataSource', () => ({ shouldUseMockData: () => false }));

import { useShowStore } from '../showStore';
import { useUserStore } from '../userStore';
import type { StoreShow } from '@/types/show-types';

const ok = <T>(rows: T[]) => ({ ok: true as const, rows, error: null });
const failed = { ok: false as const, rows: [] as never[], error: new Error('IDB timeout') };

const SHOW = { id: 'show-1', name: 'Heartland Classic', startDate: '2026-10-10' };
const ASSIGNMENT = {
  id: 'a-1',
  personId: 'judge-1',
  showId: 'show-1',
  classId: 'class-1',
  confirmedAt: '2026-09-01',
};
const KNOWN_JUDGES = [
  {
    judgeId: 'judge-1',
    judgeName: 'Pat Judge',
    assignedDate: '2026-09-01',
    assignedClasses: ['class-1'],
  },
];

function seedExistingShow(): void {
  useShowStore.setState({
    shows: [{ id: 'show-1', name: 'Heartland Classic', assignedJudges: KNOWN_JUDGES } as StoreShow],
    error: null,
  });
}

/**
 * MYK9-774: getAll() turns a failed device read into [], so the show store
 * showed "no shows", or a show with no judges, as fact. A failed read is now
 * an error for the show list and "keep what we had" for the judge join.
 */
describe('showStore — a failed device read', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useShowStore.setState({ shows: [], error: null, isLoading: false });
    useUserStore.setState({
      people: [{ id: 'judge-1', firstName: 'Pat', lastName: 'Judge' }],
    } as never);
    mockShowsTable.getAllWithStatus.mockResolvedValue(ok([SHOW]));
    mockClubsTable.getAllWithStatus.mockResolvedValue(ok([]));
    mockJudgeAssignmentsTable.getAllWithStatus.mockResolvedValue(ok([ASSIGNMENT]));
    for (const table of [mockShowsTable, mockClubsTable, mockJudgeAssignmentsTable]) {
      table.subscribe.mockReturnValue(() => {});
    }
  });

  it('joins judges when it loads shows', async () => {
    await useShowStore.getState().loadShows();

    expect(useShowStore.getState().shows[0]?.assignedJudges).toEqual(KNOWN_JUDGES);
  });

  it('keeps the judges a show already had when assignments cannot be read', async () => {
    seedExistingShow();
    mockJudgeAssignmentsTable.getAllWithStatus.mockResolvedValue(failed);

    await useShowStore.getState().loadShows();

    expect(useShowStore.getState().shows[0]?.assignedJudges).toEqual(KNOWN_JUDGES);
  });

  it.each([
    ['shows', mockShowsTable],
    ['clubs', mockClubsTable],
  ])('reports an error and keeps the list when %s cannot be read', async (_name, table) => {
    seedExistingShow();
    table.getAllWithStatus.mockResolvedValue(failed);

    await useShowStore.getState().loadShows();

    const state = useShowStore.getState();
    expect(state.error).not.toBeNull();
    expect(state.shows.map(s => s.id)).toEqual(['show-1']);
  });

  it('keeps judges on a show update when assignments cannot be read', async () => {
    seedExistingShow();
    mockJudgeAssignmentsTable.getAllWithStatus.mockResolvedValue(failed);
    useShowStore.setState({ _unsubscribe: null } as never);
    useShowStore.getState().initializeSubscription();
    const onShows = mockShowsTable.subscribe.mock.calls[0]?.[0] as (
      shows: (typeof SHOW)[]
    ) => Promise<void>;

    await onShows([SHOW]);

    expect(useShowStore.getState().shows[0]?.assignedJudges).toEqual(KNOWN_JUDGES);
    useShowStore.getState().cleanup();
  });
});
