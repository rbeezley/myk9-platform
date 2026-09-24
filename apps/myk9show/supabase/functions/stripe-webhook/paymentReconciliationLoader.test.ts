// @vitest-environment node
//
// MYK9-639 NCR-2026-09-20-01: a moved money root sent to a paid event must
// settle once when it has exactly one live descendant, and stay blocked in
// every other shape. The loader runs against an in-memory `entries` table and
// its output feeds the real reconciler, so each case asserts what gets stamped.
import { describe, expect, it } from 'vitest';

import { reconcileEntryPaymentRequest } from '../_shared/entryPaymentReconcile';
import {
  loadPaymentReconciliationEntries,
  type FetchReconciliationEntries,
  type PaymentReconciliationEntry,
} from './paymentReconciliationLoader';

type Row = Partial<PaymentReconciliationEntry> & { id: string };

function row(overrides: Row): PaymentReconciliationEntry {
  return {
    payment_status: 'pending',
    entry_status: 'confirmed',
    deleted_at: null,
    moved_from_entry_id: null,
    stripe_payment_intent_id: null,
    ...overrides,
  };
}

function table(rows: Row[]): FetchReconciliationEntries {
  const all = rows.map(row);
  return async (column, ids) => ({
    data: all.filter(entry => ids.includes((entry[column] as string | null) ?? '')),
    error: null,
  });
}

async function settle(rows: Row[], requested: string[], intent = 'pi_new') {
  const loaded = await loadPaymentReconciliationEntries(requested, table(rows));
  const result = reconcileEntryPaymentRequest({
    linkStatus: 'open',
    sessionPaymentStatus: 'paid',
    expectedEntryIds: requested,
    entries: loaded.entries,
    reconciliationEntryIds: loaded.reconciliationEntryIds,
    duplicateEntryIds: loaded.duplicateEntryIds,
    lifecycleEntryIdsByRoot: loaded.lifecycleEntryIdsByRoot,
    blockedEntryIds: loaded.blockedEntryIds,
    paymentIntentId: intent,
  });
  return { loaded, result };
}

const ROOT = row({ id: 'root', entry_status: 'moved' });
const LIVE = row({ id: 'live', moved_from_entry_id: 'root' });

describe('moved money root settlement (MYK9-639)', () => {
  it('one hop: the root settles once and is not blocked', async () => {
    const { loaded, result } = await settle([ROOT, LIVE], ['root']);
    expect(loaded.blockedEntryIds).toEqual([]);
    expect(loaded.reconciliationEntryIds).toEqual(['root']);
    expect(loaded.liveEntryIdByRoot).toEqual({ root: 'live' });
    expect(result.patches.map(patch => patch.id)).toEqual(['root']);
    expect(result.unresolvedEntryIds).toEqual([]);
  });

  it('positive control: the live destination resolves to the same root', async () => {
    const { loaded, result } = await settle([ROOT, LIVE], ['live']);
    expect(loaded.blockedEntryIds).toEqual([]);
    expect(loaded.reconciliationEntryIds).toEqual(['root']);
    expect(result.patches.map(patch => patch.id)).toEqual(['root']);
  });

  it('two hops: the top root settles once through a moved intermediate', async () => {
    const rows = [
      ROOT,
      row({ id: 'mid', entry_status: 'moved', moved_from_entry_id: 'root' }),
      row({ id: 'live', moved_from_entry_id: 'mid' }),
    ];
    const { loaded, result } = await settle(rows, ['root']);
    expect(loaded.blockedEntryIds).toEqual([]);
    expect(loaded.liveEntryIdByRoot).toEqual({ root: 'live' });
    expect(result.patches.map(patch => patch.id)).toEqual(['root']);
  });

  it('confirms a pending-payment live descendant when its root is paid', async () => {
    const rows = [
      ROOT,
      row({ id: 'live', moved_from_entry_id: 'root', entry_status: 'pending-payment' }),
    ];
    const { result } = await settle(rows, ['root']);
    expect(result.patches).toEqual([
      expect.objectContaining({
        id: 'root',
        entry_status: 'confirmed',
        entryStatusEntryId: 'live',
      }),
    ]);
  });

  it('ignores a reversed (soft-deleted) sibling next to the one live descendant', async () => {
    const rows = [
      ROOT,
      row({ id: 'undone', moved_from_entry_id: 'root', deleted_at: '2026-09-19T12:00:00Z' }),
      LIVE,
    ];
    const { loaded, result } = await settle(rows, ['root']);
    expect(loaded.blockedEntryIds).toEqual([]);
    expect(result.patches.map(patch => patch.id)).toEqual(['root']);
  });

  it('already paid by another payment: no second stamp', async () => {
    const rows = [
      row({ ...ROOT, payment_status: 'paid', stripe_payment_intent_id: 'pi_old' }),
      LIVE,
    ];
    const { result } = await settle(rows, ['root']);
    expect(result.patches).toEqual([]);
    expect(result.alreadyPaidEntryIds).toEqual(['root']);
  });

  it('already paid by this same payment (replay): no second stamp', async () => {
    const rows = [
      row({ ...ROOT, payment_status: 'paid', stripe_payment_intent_id: 'pi_new' }),
      LIVE,
    ];
    const { result } = await settle(rows, ['root']);
    expect(result.patches).toEqual([]);
    expect(result.sameIntentPaidEntryIds).toEqual(['root']);
    expect(result.alreadyPaidEntryIds).toEqual([]);
  });

  it.each([
    ['deleted', { deleted_at: '2026-09-19T12:00:00Z' }],
    ['withdrawn', { entry_status: 'withdrawn' }],
    ['scratched', { entry_status: 'scratched' }],
  ])('blocks the root when its only descendant is %s', async (_label, patch) => {
    const { loaded, result } = await settle([ROOT, row({ ...LIVE, ...patch })], ['root']);
    expect(loaded.blockedEntryIds).toEqual(['root']);
    expect(result.patches).toEqual([]);
    expect(result.unresolvedEntryIds).toEqual(['root']);
  });

  it('blocks a stale moved row with no descendant at all', async () => {
    const { loaded, result } = await settle([ROOT], ['root']);
    expect(loaded.blockedEntryIds).toEqual(['root']);
    expect(result.patches).toEqual([]);
  });

  it('blocks a deleted moved root', async () => {
    const rows = [row({ ...ROOT, deleted_at: '2026-09-19T12:00:00Z' }), LIVE];
    const { loaded, result } = await settle(rows, ['root']);
    expect(loaded.blockedEntryIds).toEqual(['root']);
    expect(result.patches).toEqual([]);
  });

  it('blocks a destination whose moved root was deleted', async () => {
    const rows = [row({ ...ROOT, deleted_at: '2026-09-19T12:00:00Z' }), LIVE];
    const { loaded, result } = await settle(rows, ['live']);
    expect(loaded.blockedEntryIds).toEqual(['live']);
    expect(result.patches).toEqual([]);
  });

  it('blocks a deleted plain entry', async () => {
    const rows = [row({ id: 'plain', deleted_at: '2026-09-19T12:00:00Z' })];
    const { loaded, result } = await settle(rows, ['plain']);
    expect(loaded.blockedEntryIds).toEqual(['plain']);
    expect(result.patches).toEqual([]);
  });

  it('blocks a destination whose root row is missing', async () => {
    const { loaded, result } = await settle([LIVE], ['live']);
    expect(loaded.blockedEntryIds).toEqual(['live']);
    expect(result.patches).toEqual([]);
  });

  it('never stamps a requested root that does not exist', async () => {
    const { result } = await settle([LIVE], ['root']);
    expect(result.patches).toEqual([]);
    expect(result.missingEntryIds).toEqual(['root']);
  });

  it('blocks the root when it has two live descendants', async () => {
    const rows = [ROOT, LIVE, row({ id: 'live-2', moved_from_entry_id: 'root' })];
    const { loaded, result } = await settle(rows, ['root']);
    expect(loaded.blockedEntryIds).toEqual(['root']);
    expect(result.patches).toEqual([]);
  });

  it('blocks either destination when the root has two live descendants', async () => {
    const rows = [ROOT, LIVE, row({ id: 'live-2', moved_from_entry_id: 'root' })];
    const { loaded, result } = await settle(rows, ['live']);
    expect(loaded.blockedEntryIds).toEqual(['live']);
    expect(result.patches).toEqual([]);
  });

  it('blocks a cycle of moved rows', async () => {
    const rows = [
      row({ id: 'root', entry_status: 'moved', moved_from_entry_id: 'mid' }),
      row({ id: 'mid', entry_status: 'moved', moved_from_entry_id: 'root' }),
    ];
    const { loaded, result } = await settle(rows, ['root']);
    expect(loaded.blockedEntryIds).toEqual(['root']);
    expect(result.patches).toEqual([]);
  });

  it('blocks a cycle that passes through a live row', async () => {
    const rows = [row({ ...ROOT, moved_from_entry_id: 'live' }), LIVE];
    const { loaded, result } = await settle(rows, ['root']);
    expect(loaded.blockedEntryIds).toEqual(['root']);
    expect(result.patches).toEqual([]);
  });

  it('blocks a moved intermediate: only the top root carries the money', async () => {
    const rows = [
      ROOT,
      row({ id: 'mid', entry_status: 'moved', moved_from_entry_id: 'root' }),
      row({ id: 'live', moved_from_entry_id: 'mid' }),
    ];
    const { loaded, result } = await settle(rows, ['mid']);
    expect(loaded.blockedEntryIds).toEqual(['mid']);
    expect(result.patches).toEqual([]);
  });

  it('blocks a chain deeper than the hop cap', async () => {
    const rows: Row[] = [ROOT];
    let parent = 'root';
    for (let hop = 0; hop < 20; hop += 1) {
      rows.push({ id: `hop-${hop}`, entry_status: 'moved', moved_from_entry_id: parent });
      parent = `hop-${hop}`;
    }
    rows.push({ id: 'live', moved_from_entry_id: parent });
    const { loaded, result } = await settle(rows, ['root']);
    expect(loaded.blockedEntryIds).toEqual(['root']);
    expect(result.patches).toEqual([]);
  });

  it('blocks a fork whose second branch runs past the hop cap', async () => {
    const rows: Row[] = [ROOT, LIVE];
    let parent = 'root';
    for (let hop = 0; hop < 20; hop += 1) {
      rows.push({ id: `hop-${hop}`, entry_status: 'moved', moved_from_entry_id: parent });
      parent = `hop-${hop}`;
    }
    rows.push({ id: 'live-deep', moved_from_entry_id: parent });
    const { loaded, result } = await settle(rows, ['root']);
    expect(loaded.blockedEntryIds).toEqual(['root']);
    expect(result.patches).toEqual([]);
  });

  it('root plus destination in one request: one payment only', async () => {
    const { loaded, result } = await settle([ROOT, LIVE], ['root', 'live']);
    expect(loaded.blockedEntryIds).toEqual([]);
    expect(loaded.reconciliationEntryIds).toEqual(['root', 'root']);
    expect(loaded.duplicateEntryIds).toEqual(['live']);
    expect(result.patches.map(patch => patch.id)).toEqual(['root']);
  });

  it('destination plus root in one request (reverse order): one payment only', async () => {
    const { loaded, result } = await settle([ROOT, LIVE], ['live', 'root']);
    expect(loaded.blockedEntryIds).toEqual([]);
    expect(loaded.duplicateEntryIds).toEqual(['live']);
    expect(result.patches.map(patch => patch.id)).toEqual(['root']);
  });
});
