import { describe, expect, it } from 'vitest';
import {
  buildMoneyAttribution,
  indexEntriesById,
  isSupersededMoveUpEntry,
  MONEY_ROOT_MAX_DEPTH,
  resolveMoneyRoot,
} from './moneyRoot';

interface Row {
  id: string;
  entryStatus?: string | null;
  movedFromEntryId?: string | null;
  fee: number;
}

/** The finding's own show: one dog, $35 by check, Novice A → Advanced A. */
const SOURCE: Row = { id: 'source', entryStatus: 'moved', fee: 35 };
const DESTINATION: Row = {
  id: 'dest',
  entryStatus: 'confirmed',
  movedFromEntryId: 'source',
  fee: 0,
};

describe('resolveMoneyRoot', () => {
  it('returns an ordinary entry as its own money root', () => {
    const plain: Row = { id: 'plain', entryStatus: 'confirmed', fee: 35 };
    expect(resolveMoneyRoot(plain, indexEntriesById([plain]))).toEqual({ root: plain });
  });

  it('follows one hop to the entry the exhibitor paid for', () => {
    const byId = indexEntriesById([SOURCE, DESTINATION]);
    expect(resolveMoneyRoot(DESTINATION, byId)).toEqual({ root: SOURCE });
  });

  it('follows a DOUBLE move (Novice → Advanced → Excellent) to the original payment', () => {
    // The second move-up's destination is money-neutral too, and points at the
    // first one — which is itself money-neutral. Only the original entry ever
    // held the $35, and a one-hop resolver would have stopped at $0.
    const first: Row = { id: 'a', entryStatus: 'moved', fee: 35 };
    const second: Row = { id: 'b', entryStatus: 'moved', movedFromEntryId: 'a', fee: 0 };
    const third: Row = { id: 'c', entryStatus: 'confirmed', movedFromEntryId: 'b', fee: 0 };

    const resolution = resolveMoneyRoot(third, indexEntriesById([first, second, third]));
    expect(resolution.root).toBe(first);
    expect(resolution.root.fee).toBe(35);
    expect(resolution.problem).toBeUndefined();
  });

  it('SURFACES a root outside the scope instead of reporting $0', () => {
    // A trial-scoped report whose move-up source sits in another trial. The
    // destination records no money, so a silent fallback would drop a real $35
    // off a reconciliation report without a word.
    const resolution = resolveMoneyRoot(DESTINATION, indexEntriesById([DESTINATION]));
    expect(resolution.root).toBe(DESTINATION);
    expect(resolution.problem).toBe('missing-link');
    expect(resolution.brokenAt).toBe('source');
  });

  it('terminates on a cycle rather than hanging a show-day report', () => {
    const a: Row = { id: 'a', movedFromEntryId: 'b', fee: 10 };
    const b: Row = { id: 'b', movedFromEntryId: 'a', fee: 20 };

    const resolution = resolveMoneyRoot(a, indexEntriesById([a, b]));
    expect(resolution.problem).toBe('cycle');
    expect(resolution.brokenAt).toBe('a');
  });

  it('stops at the depth cap on a chain longer than any real ladder', () => {
    const rows: Row[] = Array.from({ length: MONEY_ROOT_MAX_DEPTH + 3 }, (_, index) => ({
      id: `e${index}`,
      fee: 0,
      ...(index > 0 ? { movedFromEntryId: `e${index - 1}` } : {}),
    }));

    const last = rows[rows.length - 1] as Row;
    expect(resolveMoneyRoot(last, indexEntriesById(rows)).problem).toBe('too-deep');
  });
});

describe('isSupersededMoveUpEntry', () => {
  it('recognises only the superseded state, whatever its casing', () => {
    expect(isSupersededMoveUpEntry({ entryStatus: 'moved' })).toBe(true);
    expect(isSupersededMoveUpEntry({ entryStatus: ' MOVED ' })).toBe(true);
    expect(isSupersededMoveUpEntry({ entryStatus: 'move-up-requested' })).toBe(false);
    expect(isSupersededMoveUpEntry({ entryStatus: 'withdrawn' })).toBe(false);
    expect(isSupersededMoveUpEntry({ entryStatus: null })).toBe(false);
    expect(isSupersededMoveUpEntry({})).toBe(false);
  });
});

describe('buildMoneyAttribution', () => {
  it('counts the run once and points it at the money', () => {
    const attribution = buildMoneyAttribution([SOURCE, DESTINATION]);

    expect(attribution.live.map(row => row.id)).toEqual(['dest']);
    expect(attribution.rootById.get('dest')).toBe(SOURCE);
    expect(attribution.unresolved).toEqual([]);
  });

  it('leaves withdrawn and scratched entries counted — their money is real', () => {
    const withdrawn: Row = { id: 'w', entryStatus: 'withdrawn', fee: 35 };
    const scratched: Row = { id: 's', entryStatus: 'scratched', fee: 35 };

    expect(buildMoneyAttribution([withdrawn, scratched]).live.map(row => row.id)).toEqual([
      'w',
      's',
    ]);
  });

  it('FLAGS a superseded row no live entry claims, instead of losing its money', () => {
    // The one legacy pair on the live database: written by the pre-MYK9-639
    // code, which left a `waived` $0 destination and no FK. Excluding the source
    // is right — the dog ran once — but its $35 then had nowhere to go, and the
    // report printed the "Waived/Comped" row MYK9-639 was filed to remove.
    const orphan: Row = { id: 'legacy-moved', entryStatus: 'moved', fee: 35 };
    const legacyDestination: Row = { id: 'legacy-dest', entryStatus: 'confirmed', fee: 0 };

    const attribution = buildMoneyAttribution([orphan, legacyDestination]);

    expect(attribution.live.map(row => row.id)).toEqual(['legacy-dest']);
    expect(attribution.unresolved).toEqual([
      { entryId: 'legacy-moved', problem: 'orphaned-supersession' },
    ]);
  });

  it('says nothing about a superseded row a live descendant DOES claim', () => {
    expect(buildMoneyAttribution([SOURCE, DESTINATION]).unresolved).toEqual([]);
  });

  it('claims every superseded row in a multi-hop chain', () => {
    const first: Row = { id: 'a', entryStatus: 'moved', fee: 35 };
    const second: Row = { id: 'b', entryStatus: 'moved', movedFromEntryId: 'a', fee: 0 };
    const third: Row = { id: 'c', entryStatus: 'confirmed', movedFromEntryId: 'b', fee: 0 };

    expect(buildMoneyAttribution([first, second, third]).unresolved).toEqual([]);
  });

  it('reports an unreachable root against the LIVE entry that needs it', () => {
    const attribution = buildMoneyAttribution([DESTINATION]);

    expect(attribution.live.map(row => row.id)).toEqual(['dest']);
    expect(attribution.unresolved).toEqual([
      { entryId: 'dest', problem: 'missing-link', brokenAt: 'source' },
    ]);
  });
});
