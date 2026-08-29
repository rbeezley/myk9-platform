/**
 * F27 second pass — Codex caught that the first fix could never run.
 *
 * `useScoringBreadcrumb` derives `showId` FROM the class row, read out of the local
 * replica. On a cold store that read returns null without throwing, so the breadcrumb
 * reported `showId: undefined` and ScoringEntryListPage's hydration block -- guarded on
 * `showId` -- was skipped in exactly the cold-store scenario it was written for. The
 * page needed the class to learn which show to sync, and the show to obtain the class.
 *
 * My own test had missed it: its breadcrumb mock hardcoded `showId: 'show-1'` even when
 * the class was absent, which the real hook never does.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const maybeSingle = vi.fn();
const eq = vi.fn(() => ({ maybeSingle }));
const select = vi.fn((_columns: string) => ({ eq }));
const from = vi.fn(() => ({ select }));

vi.mock('../supabaseClient', () => ({
  supabase: { from: (...a: unknown[]) => from(...(a as [])) },
}));

import { fetchScoringHierarchy, toTrialLabel } from './scoringHierarchy';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchScoringHierarchy', () => {
  it('resolves show and trial from a to-one embed', async () => {
    maybeSingle.mockResolvedValue({
      data: {
        id: 'class-1',
        name: 'Exterior Excellent',
        trial_id: 'trial-1',
        trial: {
          id: 'trial-1',
          name: 'Saturday',
          trial_number: 2,
          show_id: 'show-1',
          shows: { id: 'show-1', name: 'Spring Trial' },
        },
      },
      error: null,
    });

    await expect(fetchScoringHierarchy('class-1')).resolves.toEqual({
      classId: 'class-1',
      className: 'Exterior Excellent',
      trialId: 'trial-1',
      trialLabel: 'Trial 2',
      showId: 'show-1',
      showName: 'Spring Trial',
    });
  });

  it('accepts an embed returned as a single-element array', async () => {
    maybeSingle.mockResolvedValue({
      data: {
        id: 'class-1',
        name: 'Interior Novice A',
        trial_id: 'trial-1',
        trial: [
          {
            id: 'trial-1',
            name: 'Sunday',
            trial_number: null,
            show_id: 'show-9',
            shows: [{ id: 'show-9', name: 'Fall Trial' }],
          },
        ],
      },
      error: null,
    });

    const result = await fetchScoringHierarchy('class-1');
    expect(result?.showId).toBe('show-9');
    expect(result?.trialLabel).toBe('Sunday');
  });

  it('never selects * from classes, which would 42501 the whole request', async () => {
    // public.classes grants `authenticated` no table-level SELECT -- only a column
    // allowlist -- so a star, or any ungranted column, fails the entire query.
    maybeSingle.mockResolvedValue({ data: null, error: null });
    await fetchScoringHierarchy('class-1');

    const selected = select.mock.calls[0]?.[0] ?? '';
    expect(selected).not.toContain('*');
    for (const col of ['id', 'name', 'trial_id']) expect(selected).toContain(col);
  });

  it('returns null on an error rather than inventing a hierarchy', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { code: '42501' } });
    await expect(fetchScoringHierarchy('class-1')).resolves.toBeNull();
  });

  it('returns null when the class genuinely does not exist', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(fetchScoringHierarchy('nope')).resolves.toBeNull();
  });
});

describe('toTrialLabel', () => {
  it('prefers the trial number', () => {
    expect(toTrialLabel({ name: 'Saturday', trial_number: 3 })).toBe('Trial 3');
  });

  it('falls back to the name when unnumbered', () => {
    expect(toTrialLabel({ name: 'Saturday', trial_number: null })).toBe('Saturday');
    expect(toTrialLabel({ name: 'Saturday', trial_number: '' })).toBe('Saturday');
  });
});
