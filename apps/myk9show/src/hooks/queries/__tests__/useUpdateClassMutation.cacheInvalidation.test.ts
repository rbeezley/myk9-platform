/**
 * Unit tests for useUpdateClassMutation cache invalidation.
 *
 * Asserts that after the mutation succeeds, the correct React Query keys are
 * invalidated so class list views (table + cards) re-render with the updated
 * judge name.
 *
 * Assertion-first approach (per CLAUDE.md): the `expect` for the correct query
 * key is written before the implementation is touched, so a green run confirms
 * the real key is being invalidated.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ── DB layer mocks (must be registered before the module under test is imported) ──

const mockUpdateClass = vi.fn();

vi.mock('@/services/database/classes', () => ({
  updateClass: (...args: unknown[]) => mockUpdateClass(...args),
  getAllClasses: vi.fn().mockResolvedValue({ data: [], error: null }),
  getClassById: vi.fn().mockResolvedValue({ data: null, error: null }),
  getClassesByTrialId: vi.fn().mockResolvedValue({ data: [], error: null }),
  createClass: vi.fn(),
  deleteClass: vi.fn(),
  hardDeleteClass: vi.fn(),
  restoreClass: vi.fn(),
  getDeletedClasses: vi.fn().mockResolvedValue({ data: [], error: null }),
  searchClasses: vi.fn().mockResolvedValue({ data: [], error: null }),
  getClassStatistics: vi.fn().mockResolvedValue({ data: { total: 0 }, error: null }),
}));

vi.mock('@/services/database/queries/classQueries.entries', () => ({
  getAllEntries: vi.fn().mockResolvedValue({ data: [], error: null }),
  getEntriesByClassId: vi.fn().mockResolvedValue({ data: [], error: null }),
  createEntry: vi.fn(),
  updateEntry: vi.fn(),
  deleteEntry: vi.fn(),
  hardDeleteEntry: vi.fn(),
  restoreEntry: vi.fn(),
  getDeletedEntries: vi.fn().mockResolvedValue({ data: [], error: null }),
}));

// Import after mocks are registered
const { useUpdateClassMutation, classKeys } = await import('@/hooks/queries/useClassesDatabase');

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useUpdateClassMutation — cache invalidation after judge assignment', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = makeQueryClient();
    vi.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('invalidates classKeys.lists() after a successful class update', async () => {
    // Arrange: DB returns the updated class row (no judge_assignments — that's expected
    // since updateClass only touches the classes table, not judge_assignments)
    const updatedClass = {
      id: 'class-1',
      trial_id: 'trial-1',
      name: 'Interior Novice',
      status: 'upcoming',
      updated_at: new Date().toISOString(),
    };
    mockUpdateClass.mockResolvedValueOnce({ data: updatedClass, error: null });

    // Seed the list cache so we can confirm it gets invalidated
    queryClient.setQueryData(classKeys.lists(), [{ id: 'class-1', name: 'Interior Novice' }]);
    expect(queryClient.getQueryState(classKeys.lists())?.isInvalidated).toBe(false);

    const { result } = renderHook(() => useUpdateClassMutation(), {
      wrapper: makeWrapper(queryClient),
    });

    // Act: fire the mutation
    await act(async () => {
      result.current.mutate({ id: 'class-1', updates: { status: 'in_progress' } });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Assert: the list query must be invalidated so the view refetches with fresh judge data
    expect(queryClient.getQueryState(classKeys.lists())?.isInvalidated).toBe(true);
  });

  it('invalidates classKeys.byTrial(trialId) when the updated class belongs to a trial', async () => {
    const trialId = 'trial-abc';
    const updatedClass = {
      id: 'class-2',
      trial_id: trialId,
      name: 'Container Advanced',
      status: 'upcoming',
      updated_at: new Date().toISOString(),
    };
    mockUpdateClass.mockResolvedValueOnce({ data: updatedClass, error: null });

    // Seed both caches so their QueryState objects exist and isInvalidated is trackable
    queryClient.setQueryData(classKeys.lists(), [{ id: 'class-2', name: 'Container Advanced' }]);
    queryClient.setQueryData(classKeys.byTrial(trialId), [
      { id: 'class-2', name: 'Container Advanced' },
    ]);
    expect(queryClient.getQueryState(classKeys.lists())?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(classKeys.byTrial(trialId))?.isInvalidated).toBe(false);

    const { result } = renderHook(() => useUpdateClassMutation(), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      result.current.mutate({ id: 'class-2', updates: { status: 'in_progress' } });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Both the flat list AND the trial-scoped list must be invalidated
    expect(queryClient.getQueryState(classKeys.lists())?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(classKeys.byTrial(trialId))?.isInvalidated).toBe(true);
  });

  it('does NOT invalidate classKeys.byTrial when the DB returns no trial_id', async () => {
    // Some edge cases (e.g. orphaned class rows) have no trial_id
    const updatedClass = {
      id: 'class-3',
      trial_id: null,
      name: 'Buried Excellent',
      status: 'upcoming',
      updated_at: new Date().toISOString(),
    };
    mockUpdateClass.mockResolvedValueOnce({ data: updatedClass, error: null });

    // Seed both caches so QueryState objects exist for pre/post comparison
    queryClient.setQueryData(classKeys.lists(), [{ id: 'class-3' }]);
    const otherTrialKey = classKeys.byTrial('other-trial');
    queryClient.setQueryData(otherTrialKey, []);

    const { result } = renderHook(() => useUpdateClassMutation(), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      result.current.mutate({ id: 'class-3', updates: { status: 'in_progress' } });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // The unrelated trial cache must NOT be touched
    expect(queryClient.getQueryState(otherTrialKey)?.isInvalidated).toBe(false);
    // But the flat list is still invalidated
    expect(queryClient.getQueryState(classKeys.lists())?.isInvalidated).toBe(true);
  });

  it('updates the detail cache entry immediately via setQueryData', async () => {
    const classId = 'class-4';
    const updatedClass = {
      id: classId,
      trial_id: 'trial-1',
      name: 'Exterior Master',
      status: 'completed',
      updated_at: new Date().toISOString(),
    };
    mockUpdateClass.mockResolvedValueOnce({ data: updatedClass, error: null });

    const { result } = renderHook(() => useUpdateClassMutation(), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      result.current.mutate({ id: classId, updates: { status: 'completed' } });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Detail cache for this class must be set to the returned DB row
    expect(queryClient.getQueryData(classKeys.detail(classId))).toEqual(updatedClass);
  });

  it('throws and leaves cache unchanged when the DB returns an error', async () => {
    mockUpdateClass.mockResolvedValueOnce({
      data: null,
      error: { message: 'permission denied', code: '42501' },
    });

    queryClient.setQueryData(classKeys.lists(), [{ id: 'class-5' }]);

    const { result } = renderHook(() => useUpdateClassMutation(), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      result.current.mutate({ id: 'class-5', updates: { status: 'completed' } });
    });
    await waitFor(() => expect(result.current.isError).toBe(true));

    // On failure, the list cache must NOT have been invalidated (no onSuccess ran)
    expect(queryClient.getQueryState(classKeys.lists())?.isInvalidated).toBe(false);
  });
});
