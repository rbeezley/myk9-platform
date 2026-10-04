/**
 * MYK9-969: the club's show-wide private switch writes ONLY `results_private`
 * (and who changed it). It never sends a preset or timing value, so it cannot
 * overwrite a preset saved around it — whichever write lands first.
 *
 * The fake table below applies PostgREST upsert semantics: insert with the
 * table's column DEFAULTs for any column not sent, or on a `show_id` conflict
 * update only the columns sent.
 */
import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

/** Column DEFAULTs of public.show_visibility_settings (pinned by 20261004152300). */
const TABLE_DEFAULTS: Row = {
  preset: 'standard',
  placement_timing: 'class_complete',
  qualification_timing: 'immediate',
  time_timing: 'class_complete',
  faults_timing: 'class_complete',
  self_checkin_enabled: true,
  results_private: false,
};

const table = new Map<string, Row>();
const upsertPayloads = vi.fn();
const otherCalls = vi.fn();

function applyUpsert(payload: Row) {
  const id = String(payload.show_id);
  const existing = table.get(id);
  table.set(id, existing ? { ...existing, ...payload } : { ...TABLE_DEFAULTS, ...payload });
}

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: () => ({
      upsert: (payload: Row) => {
        upsertPayloads(payload);
        return {
          abortSignal: () => {
            applyUpsert(payload);
            return Promise.resolve({ error: null, status: 201 });
          },
        };
      },
      // A faithful read and update, so an implementation that reads first or
      // updates separately is observed doing it (otherCalls), not crashed.
      select: (...args: unknown[]) => {
        otherCalls('select', ...args);
        return {
          eq: (_column: string, id: string) => ({
            abortSignal: () => ({
              maybeSingle: () =>
                Promise.resolve({ data: table.get(id) ?? null, error: null, status: 200 }),
            }),
          }),
        };
      },
      update: (payload: Row) => {
        otherCalls('update', payload);
        return {
          eq: (_column: string, id: string) => ({
            abortSignal: () => {
              const existing = table.get(id);
              if (existing) table.set(id, { ...existing, ...payload });
              return Promise.resolve({ error: null, status: 204 });
            },
          }),
        };
      },
    }),
  },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

import {
  useUpdateShowCheckin,
  useUpdateShowResultsPrivacy,
  useUpdateShowVisibility,
} from '../useShowSettingsMutations';

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return React.createElement(QueryClientProvider, { client }, children);
}

const REVIEW_PRESET = {
  showId: 'show-1',
  preset: 'review' as const,
  placementTiming: 'manual_release' as const,
  qualificationTiming: 'manual_release' as const,
  timeTiming: 'manual_release' as const,
  faultsTiming: 'manual_release' as const,
};

const REVIEW_ROW = {
  preset: 'review',
  placement_timing: 'manual_release',
  qualification_timing: 'manual_release',
  time_timing: 'manual_release',
  faults_timing: 'manual_release',
};

const TIMING_COLUMNS = [
  'preset',
  'placement_timing',
  'qualification_timing',
  'time_timing',
  'faults_timing',
];

function renderHooks() {
  return renderHook(
    () => ({
      privacy: useUpdateShowResultsPrivacy(),
      preset: useUpdateShowVisibility(),
      checkin: useUpdateShowCheckin(),
    }),
    { wrapper }
  );
}

describe('show-level owned-column writes (MYK9-969)', () => {
  beforeEach(() => {
    table.clear();
    upsertPayloads.mockReset();
    otherCalls.mockReset();
  });

  it('the privacy switch sends only show_id, results_private and updated_by', async () => {
    const { result } = renderHooks();
    await act(() => result.current.privacy.mutateAsync({ showId: 'show-1', resultsPrivate: true }));

    expect(upsertPayloads).toHaveBeenCalledTimes(1);
    expect(upsertPayloads.mock.calls[0]?.[0]).toEqual({
      show_id: 'show-1',
      results_private: true,
      updated_by: 'user-1',
    });
    expect(otherCalls).not.toHaveBeenCalled();
  });

  it('self check-in sends only its own column too', async () => {
    const { result } = renderHooks();
    await act(() => result.current.checkin.mutateAsync({ showId: 'show-1', enabled: false }));

    expect(upsertPayloads.mock.calls[0]?.[0]).toEqual({
      show_id: 'show-1',
      self_checkin_enabled: false,
      updated_by: 'user-1',
    });
    expect(otherCalls).not.toHaveBeenCalled();
  });

  it('a preset created first survives a privacy toggle that lands after it', async () => {
    const { result } = renderHooks();
    await act(() => result.current.preset.mutateAsync(REVIEW_PRESET));
    await act(() => result.current.privacy.mutateAsync({ showId: 'show-1', resultsPrivate: true }));

    expect(table.get('show-1')).toMatchObject({ ...REVIEW_ROW, results_private: true });
  });

  it('a privacy toggle that creates the row first never blocks the preset saved after it', async () => {
    const { result } = renderHooks();
    await act(() => result.current.privacy.mutateAsync({ showId: 'show-1', resultsPrivate: true }));
    expect(table.get('show-1')).toMatchObject({ preset: 'standard', results_private: true });

    await act(() => result.current.preset.mutateAsync(REVIEW_PRESET));
    expect(table.get('show-1')).toMatchObject({ ...REVIEW_ROW, results_private: true });
  });

  it('both writes in flight together keep the preset, whichever is issued first', async () => {
    const { result } = renderHooks();
    await act(async () => {
      await Promise.all([
        result.current.privacy.mutateAsync({ showId: 'show-1', resultsPrivate: true }),
        result.current.preset.mutateAsync(REVIEW_PRESET),
      ]);
    });
    expect(table.get('show-1')).toMatchObject({ ...REVIEW_ROW, results_private: true });

    table.clear();
    await act(async () => {
      await Promise.all([
        result.current.preset.mutateAsync(REVIEW_PRESET),
        result.current.privacy.mutateAsync({ showId: 'show-1', resultsPrivate: true }),
      ]);
    });
    expect(table.get('show-1')).toMatchObject({ ...REVIEW_ROW, results_private: true });
  });

  it('never sends a timing column from either owned-column writer', async () => {
    const { result } = renderHooks();
    await act(() => result.current.privacy.mutateAsync({ showId: 'show-1', resultsPrivate: true }));
    await act(() => result.current.checkin.mutateAsync({ showId: 'show-1', enabled: true }));
    for (const [payload] of upsertPayloads.mock.calls) {
      for (const column of TIMING_COLUMNS) expect(payload).not.toHaveProperty(column);
    }
  });
});
