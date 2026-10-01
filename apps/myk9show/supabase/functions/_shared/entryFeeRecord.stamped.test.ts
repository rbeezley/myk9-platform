// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { recordChargedFeesForStamped, type EntryFeeRecordClient } from './entryFeeRecord';

// Codex round 3: the fee-recording step runs ONCE per stamped entry, and not at all
// for an entry whose stored fee is already positive (no N^2 no-op requests).
function countingClient() {
  const updates: { id: string; entry_fee: number }[] = [];
  const client: EntryFeeRecordClient = {
    from() {
      return {
        update(values) {
          return {
            eq(_column, id) {
              return {
                or() {
                  return {
                    select() {
                      updates.push({ id, entry_fee: values.entry_fee });
                      return Promise.resolve({ data: [{ id }], error: null });
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
  return { client, updates };
}

describe('recordChargedFeesForStamped', () => {
  it('5 stamped entries with positive fees: ZERO fee updates', async () => {
    const ids = ['e1', 'e2', 'e3', 'e4', 'e5'];
    const { client, updates } = countingClient();
    const result = await recordChargedFeesForStamped(client, {
      stampedEntryIds: ids,
      storedFeeById: new Map(ids.map(id => [id, '30.00'])),
      chargedCentsById: new Map(ids.map(id => [id, 3000])),
    });
    expect(updates).toHaveLength(0);
    expect(result).toEqual({ recorded: [], failed: [] });
  });

  it('2 NULL/0-fee entries among 5: exactly 2 updates, each recording its charged amount', async () => {
    const { client, updates } = countingClient();
    const result = await recordChargedFeesForStamped(client, {
      stampedEntryIds: ['e1', 'e2', 'e3', 'e4', 'e5'],
      storedFeeById: new Map<string, number | string | null>([
        ['e1', 30],
        ['e2', null],
        ['e3', 30],
        ['e4', 0],
        ['e5', 30],
      ]),
      chargedCentsById: new Map([
        ['e1', 3000],
        ['e2', 3000],
        ['e3', 3000],
        ['e4', 1500],
        ['e5', 3000],
      ]),
    });
    expect(updates).toEqual([
      { id: 'e2', entry_fee: 30 },
      { id: 'e4', entry_fee: 15 },
    ]);
    expect(result.recorded).toEqual(['e2', 'e4']);
  });

  it('a repeated id is written once, and an unloaded entry is attempted (the UPDATE is conditional)', async () => {
    const { client, updates } = countingClient();
    await recordChargedFeesForStamped(client, {
      stampedEntryIds: ['e9', 'e9', 'e9'],
      storedFeeById: new Map(),
      chargedCentsById: new Map([['e9', 2500]]),
    });
    expect(updates).toEqual([{ id: 'e9', entry_fee: 25 }]);
  });

  it('skips an entry with no charged amount and reports a failed write', async () => {
    const failing: EntryFeeRecordClient = {
      from: () => ({
        update: () => ({
          eq: () => ({
            or: () => ({
              select: () => Promise.resolve({ data: null, error: { message: 'boom' } }),
            }),
          }),
        }),
      }),
    };
    const result = await recordChargedFeesForStamped(failing, {
      stampedEntryIds: ['a', 'b'],
      storedFeeById: new Map([['a', null]]),
      chargedCentsById: new Map([['a', 3000]]),
    });
    expect(result.failed).toEqual([{ id: 'a', error: { message: 'boom' } }]);
    expect(result.recorded).toEqual([]);
  });
});
