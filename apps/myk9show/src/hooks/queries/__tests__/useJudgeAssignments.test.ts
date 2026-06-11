import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import {
  useJudgeAssignments,
  mapAssignmentRowToJudgeClass,
  mapReplicatedAssignmentToJudgeClass,
  parseScheduledTime,
  JUDGE_ASSIGNMENTS_SELECT,
  type JudgeAssignmentRow,
} from '../useJudgeAssignments';
import type { ReplicatedJudgeAssignment } from '@/services/replication';

// ── Auth context mock ──────────────────────────────────────────────────────────
const mockDatabaseUserId = vi.hoisted(() => ({ current: 'person-123' as string | undefined }));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    userWithRoles: { databaseUserId: mockDatabaseUserId.current },
  }),
}));

// ── Replication store mock ───────────────────────────────────────────────────────
const mockGetAll = vi.fn();
vi.mock('@/services/replication', () => ({
  replicatedJudgeAssignmentsTable: { getAll: () => mockGetAll() },
}));

// ── Supabase mock (PostgREST fallback path + fallback helper plumbing) ────────────
const mockIn = vi.fn();
const mockEq = vi.fn(() => ({ in: mockIn }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
  logQuery: vi.fn(),
  createDatabaseError: (error: unknown) =>
    Object.assign(new Error((error as { message?: string })?.message ?? 'db error'), {
      name: 'DatabaseError',
    }),
}));

// ── Helpers ────────────────────────────────────────────────────────────────────
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

const makeRow = (overrides: Partial<JudgeAssignmentRow> = {}): JudgeAssignmentRow => ({
  id: 'assignment-1',
  class_id: 'class-1',
  show_id: 'show-1',
  status: 'confirmed',
  classes: {
    id: 'class-1',
    name: 'Interior Novice A',
    element: 'Interior',
    level: 'Novice',
    status: 'upcoming',
    start_time: '09:00:00',
    total_entries_count: 20,
    scored_count: 5,
    trial_id: 'trial-1',
    trials: { id: 'trial-1', date: '2026-06-10', timezone: 'America/Chicago', show_id: 'show-1' },
  },
  ...overrides,
});

const makeReplicated = (
  overrides: Partial<ReplicatedJudgeAssignment> = {}
): ReplicatedJudgeAssignment => ({
  id: 'assignment-1',
  personId: 'person-123',
  showId: 'show-1',
  trialId: 'trial-1',
  classId: 'class-1',
  status: 'confirmed',
  invitedAt: null,
  confirmedAt: null,
  fee: null,
  notes: null,
  className: 'Interior Novice A',
  classElement: 'Interior',
  classLevel: 'Novice',
  classStatus: 'in_progress',
  classStartTime: '09:00:00',
  classScoredCount: 5,
  classTotalEntries: 20,
  trialDate: '2026-06-10',
  trialTimezone: 'America/Chicago',
  ...overrides,
});

describe('mapAssignmentRowToJudgeClass (PostgREST shape)', () => {
  it('maps a full row to a JudgeClass including trial timezone', () => {
    const result = mapAssignmentRowToJudgeClass(makeRow());

    expect(result).toEqual({
      id: 'assignment-1',
      showId: 'show-1',
      trialId: 'trial-1',
      classId: 'class-1',
      name: 'Interior Novice A',
      element: 'Interior',
      level: 'Novice',
      trialDate: '2026-06-10',
      trialTimezone: 'America/Chicago',
      scheduledTime: new Date('2026-06-10T09:00:00'),
      ringNumber: null,
      totalEntries: 20,
      completedEntries: 5,
      status: 'pending',
    });
  });

  it('defaults a missing trial timezone to America/New_York', () => {
    const row = makeRow();
    row.classes!.trials!.timezone = null;
    expect(mapAssignmentRowToJudgeClass(row)?.trialTimezone).toBe('America/New_York');
  });

  it("maps class status 'in_progress' to 'in-progress' and 'completed' through", () => {
    const inProgress = makeRow();
    inProgress.classes!.status = 'in_progress';
    expect(mapAssignmentRowToJudgeClass(inProgress)?.status).toBe('in-progress');

    const done = makeRow();
    done.classes!.status = 'completed';
    expect(mapAssignmentRowToJudgeClass(done)?.status).toBe('completed');
  });

  it("maps 'setup' and null class statuses to 'pending'", () => {
    const setupRow = makeRow();
    setupRow.classes!.status = 'setup';
    expect(mapAssignmentRowToJudgeClass(setupRow)?.status).toBe('pending');

    const nullRow = makeRow();
    nullRow.classes!.status = null;
    expect(mapAssignmentRowToJudgeClass(nullRow)?.status).toBe('pending');
  });

  it('returns null for unjudgeable rows (no class, no trial, cancelled)', () => {
    expect(mapAssignmentRowToJudgeClass(makeRow({ classes: null }))).toBeNull();

    const noTrial = makeRow();
    noTrial.classes!.trials = null;
    expect(mapAssignmentRowToJudgeClass(noTrial)).toBeNull();

    const cancelled = makeRow();
    cancelled.classes!.status = 'cancelled';
    expect(mapAssignmentRowToJudgeClass(cancelled)).toBeNull();
  });

  it('falls back to the trial show_id when the assignment show_id is null', () => {
    expect(mapAssignmentRowToJudgeClass(makeRow({ show_id: null }))?.showId).toBe('show-1');
  });

  it('defaults null entry counts to zero', () => {
    const row = makeRow();
    row.classes!.total_entries_count = null;
    row.classes!.scored_count = null;
    const result = mapAssignmentRowToJudgeClass(row);
    expect(result?.totalEntries).toBe(0);
    expect(result?.completedEntries).toBe(0);
  });
});

describe('mapReplicatedAssignmentToJudgeClass (denormalized replication shape)', () => {
  it('maps a denormalized assignment to a JudgeClass', () => {
    expect(mapReplicatedAssignmentToJudgeClass(makeReplicated())).toEqual({
      id: 'assignment-1',
      showId: 'show-1',
      trialId: 'trial-1',
      classId: 'class-1',
      name: 'Interior Novice A',
      element: 'Interior',
      level: 'Novice',
      trialDate: '2026-06-10',
      trialTimezone: 'America/Chicago',
      scheduledTime: new Date('2026-06-10T09:00:00'),
      ringNumber: null,
      totalEntries: 20,
      completedEntries: 5,
      status: 'in-progress',
    });
  });

  it('returns null when the class/trial snapshot is missing (un-enriched local row)', () => {
    expect(mapReplicatedAssignmentToJudgeClass(makeReplicated({ className: null }))).toBeNull();
    expect(mapReplicatedAssignmentToJudgeClass(makeReplicated({ trialDate: null }))).toBeNull();
    expect(mapReplicatedAssignmentToJudgeClass(makeReplicated({ classId: null }))).toBeNull();
  });

  it('returns null for a cancelled class', () => {
    expect(
      mapReplicatedAssignmentToJudgeClass(makeReplicated({ classStatus: 'cancelled' }))
    ).toBeNull();
  });

  it('defaults a missing trial timezone to America/New_York', () => {
    expect(
      mapReplicatedAssignmentToJudgeClass(makeReplicated({ trialTimezone: null }))?.trialTimezone
    ).toBe('America/New_York');
  });
});

describe('parseScheduledTime', () => {
  it('combines trial date with a Postgres TIME value', () => {
    expect(parseScheduledTime('2026-06-10', '14:30:00')).toEqual(new Date('2026-06-10T14:30:00'));
  });

  it('parses a full ISO timestamp directly', () => {
    expect(parseScheduledTime('2026-06-10', '2026-06-11T08:00:00Z')).toEqual(
      new Date('2026-06-11T08:00:00Z')
    );
  });

  it('falls back to local midnight of the trial date when start_time is null', () => {
    expect(parseScheduledTime('2026-06-10', null)).toEqual(new Date('2026-06-10T00:00:00'));
  });
});

describe('JUDGE_ASSIGNMENTS_SELECT', () => {
  it('pins every column the PostgREST mapper reads, including the trial embed', () => {
    // A typo'd column or broken embed nesting would otherwise pass every test
    // here and 400 only at runtime.
    expect(JUDGE_ASSIGNMENTS_SELECT.replace(/\s+/g, '')).toBe(
      'id,class_id,show_id,status,classes(id,name,element,level,status,start_time,' +
        'total_entries_count,scored_count,trial_id,trials(id,date,timezone,show_id))'
    );
  });
});

describe('useJudgeAssignments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDatabaseUserId.current = 'person-123';
  });

  it('reads from the replication store first and skips PostgREST when warm', async () => {
    mockGetAll.mockResolvedValueOnce([
      makeReplicated({ id: 'a-mine' }),
      makeReplicated({ id: 'a-other', personId: 'someone-else' }),
      makeReplicated({ id: 'a-pending-invite', status: 'invited' }),
      makeReplicated({ id: 'a-declined', status: 'declined' }),
    ]);

    const { result } = renderHook(() => useJudgeAssignments(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Only this judge's confirmed/invited assignments survive.
    expect(result.current.assignments.map(a => a.id).sort()).toEqual(['a-mine', 'a-pending-invite']);
    expect(mockFrom).not.toHaveBeenCalled();
    expect(result.current.isError).toBe(false);
  });

  it('falls back to a PostgREST query when the replication store is cold', async () => {
    mockGetAll.mockResolvedValueOnce([]);
    mockIn.mockResolvedValueOnce({ data: [makeRow()], error: null });

    const { result } = renderHook(() => useJudgeAssignments(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockFrom).toHaveBeenCalledWith('judge_assignments');
    expect(mockSelect).toHaveBeenCalledWith(JUDGE_ASSIGNMENTS_SELECT);
    expect(mockEq).toHaveBeenCalledWith('person_id', 'person-123');
    expect(mockIn).toHaveBeenCalledWith('status', ['confirmed', 'invited']);
    expect(result.current.assignments.map(a => a.id)).toEqual(['assignment-1']);
  });

  it('falls back to PostgREST when the replication store throws', async () => {
    mockGetAll.mockRejectedValueOnce(new Error('store unavailable'));
    mockIn.mockResolvedValueOnce({ data: [makeRow()], error: null });

    const { result } = renderHook(() => useJudgeAssignments(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockFrom).toHaveBeenCalledWith('judge_assignments');
    expect(result.current.assignments.map(a => a.id)).toEqual(['assignment-1']);
  });

  it('returns mapped assignments sorted by scheduled time', async () => {
    mockGetAll.mockResolvedValueOnce([
      makeReplicated({ id: 'a-later', classStartTime: '13:00:00' }),
      makeReplicated({ id: 'a-earlier', classStartTime: '08:00:00' }),
    ]);

    const { result } = renderHook(() => useJudgeAssignments(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.assignments.map(a => a.id)).toEqual(['a-earlier', 'a-later']);
  });

  it('surfaces an error when both replication and PostgREST fail', async () => {
    mockGetAll.mockResolvedValueOnce([]);
    mockIn.mockResolvedValueOnce({ data: null, error: { message: 'DB error' } });

    const { result } = renderHook(() => useJudgeAssignments(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.assignments).toEqual([]);
  });

  it('reports loading (not empty) while the judge identity is still resolving', () => {
    mockDatabaseUserId.current = undefined;

    const { result } = renderHook(() => useJudgeAssignments(), { wrapper: createWrapper() });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.assignments).toEqual([]);
    expect(mockGetAll).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
