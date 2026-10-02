import { describe, it, expect } from 'vitest';
import {
  resolveDetailPageState,
  type DetailPageInputs,
  type DetailPageState,
} from '../detailPageState';

/**
 * MYK9-930: ONE function decides what a person or dog detail page shows, from
 * every input at once, so no two branches can disagree. Precedence, highest first:
 * error, loading, denied, notFound, ready.
 */
type Viewer = 'exhibitor' | 'secretary';

interface Row extends DetailPageInputs {
  viewer: Viewer;
}

// The rule, written independently of the implementation for the exhaustive table.
function expectedState(row: Row): DetailPageState {
  if (row.read === 'error') return 'error';
  if (row.read === 'loading' || row.identity === 'unresolved') return 'loading';
  if (row.access === 'denied') return 'denied';
  if (!row.recordPresent) return 'notFound';
  return 'ready';
}

function allRows(): Row[] {
  const rows: Row[] = [];
  for (const viewer of ['exhibitor', 'secretary'] as const) {
    for (const identity of ['resolved', 'unresolved'] as const) {
      for (const read of ['loading', 'success', 'error'] as const) {
        for (const recordPresent of [true, false]) {
          // A secretary is never denied; only an exhibitor can be.
          const accesses =
            viewer === 'secretary' ? (['allowed'] as const) : (['allowed', 'denied'] as const);
          for (const access of accesses) {
            rows.push({ viewer, identity, read, recordPresent, access });
          }
        }
      }
    }
  }
  return rows;
}

describe('resolveDetailPageState (MYK9-930)', () => {
  const rows = allRows();

  it('enumerates every combination (2 viewers x identity x read x record x access)', () => {
    // exhibitor: 2*3*2*2 = 24, secretary: 2*3*2*1 = 12
    expect(rows).toHaveLength(36);
  });

  it.each(rows.map(row => [JSON.stringify(row), row] as const))('%s', (_label, row) => {
    expect(resolveDetailPageState(row)).toBe(expectedState(row));
  });

  describe('named cases', () => {
    const base: DetailPageInputs = {
      identity: 'resolved',
      read: 'success',
      recordPresent: true,
      access: 'allowed',
    };

    it('Codex round 4: an exhibitor with unresolved identity and a failed roster read gets the error, not a skeleton', () => {
      expect(
        resolveDetailPageState({
          ...base,
          identity: 'unresolved',
          read: 'error',
          recordPresent: false,
        })
      ).toBe('error');
    });

    it('a read failure always wins, so retry is always reachable', () => {
      for (const identity of ['resolved', 'unresolved'] as const) {
        for (const access of ['allowed', 'denied'] as const) {
          for (const recordPresent of [true, false]) {
            expect(resolveDetailPageState({ identity, access, recordPresent, read: 'error' })).toBe(
              'error'
            );
          }
        }
      }
    });

    it('an unresolved identity is loading, never notFound or denied', () => {
      expect(
        resolveDetailPageState({ ...base, identity: 'unresolved', recordPresent: false })
      ).toBe('loading');
      expect(resolveDetailPageState({ ...base, identity: 'unresolved', access: 'denied' })).toBe(
        'loading'
      );
    });

    it('notFound only when everything has resolved and the record is absent', () => {
      expect(resolveDetailPageState({ ...base, recordPresent: false })).toBe('notFound');
    });

    it('denied beats notFound', () => {
      expect(resolveDetailPageState({ ...base, recordPresent: false, access: 'denied' })).toBe(
        'denied'
      );
    });
  });
});
