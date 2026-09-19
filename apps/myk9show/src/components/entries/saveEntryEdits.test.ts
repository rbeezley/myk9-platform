/**
 * MYK9-561: the Save Changes body only writes what actually CHANGED.
 *
 * The jump-height guard is the one this issue's round-1 review added: re-picking
 * the same value still writes `classEdits[id].jumpHeight`, and a handler edit
 * alone satisfies the dialog's `hasChanges()`, so an un-compared save fired the
 * RPC for a height nobody touched — raising 42501 on a checked-in entry AFTER
 * the handler write had already committed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  updateEntryDetails: vi.fn(),
  updateEntryHandler: vi.fn(),
}));

vi.mock('@/services/database/entries', () => ({
  updateEntryDetails: mocks.updateEntryDetails,
  updateEntryHandler: mocks.updateEntryHandler,
}));

import { saveEntryEdits } from './saveEntryEdits';

const classes = [{ id: 'entry-1', jumpHeight: '8"', handler: 'Pat Owner' }];

describe('saveEntryEdits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateEntryDetails.mockResolvedValue({ error: null });
    mocks.updateEntryHandler.mockResolvedValue({ error: null });
  });

  it('does NOT call the jump-height RPC when the height is unchanged', async () => {
    const result = await saveEntryEdits({
      classes,
      // A handler edit plus a re-pick of the SAME height: exactly the shape that
      // used to fire a pointless second write.
      classEdits: { 'entry-1': { handler: 'Sam Handler', jumpHeight: '8"' } },
      clearHandlerId: false,
    });

    expect(mocks.updateEntryHandler).toHaveBeenCalledTimes(1);
    expect(mocks.updateEntryDetails).not.toHaveBeenCalled();
    expect(result.error).toBeNull();
  });

  it('calls it when the height really changed', async () => {
    await saveEntryEdits({
      classes,
      classEdits: { 'entry-1': { jumpHeight: '12"' } },
      clearHandlerId: false,
    });

    expect(mocks.updateEntryDetails).toHaveBeenCalledWith({
      entryId: 'entry-1',
      jumpHeight: '12"',
    });
  });

  it('skips a withdrawn row and a row with no edits at all', async () => {
    await saveEntryEdits({
      classes: [...classes, { id: 'entry-2', jumpHeight: '8"' }],
      classEdits: { 'entry-1': { jumpHeight: '12"', status: 'withdrawn' } },
      clearHandlerId: false,
    });

    expect(mocks.updateEntryDetails).not.toHaveBeenCalled();
  });

  it('turns a jump-height SQLSTATE into a sentence, not the raw Postgres text', async () => {
    mocks.updateEntryDetails.mockResolvedValue({
      error: {
        code: '42501',
        message: 'Entry 22eb47a9-0000-0000-0000-000000000000 is checked in at the show',
      },
    });

    const result = await saveEntryEdits({
      classes,
      classEdits: { 'entry-1': { jumpHeight: '12"' } },
      clearHandlerId: false,
    });

    expect(result.error).toBe(
      'This jump height can no longer be changed — ask the secretary to change it.'
    );
    expect(result.error).not.toContain('22eb47a9');
  });

  it('stops at a failed handler write and never reaches the height', async () => {
    mocks.updateEntryHandler.mockResolvedValue({ error: { message: 'nope' } });

    const result = await saveEntryEdits({
      classes,
      classEdits: { 'entry-1': { handler: 'Sam Handler', jumpHeight: '12"' } },
      clearHandlerId: false,
    });

    expect(result.error).toBe('Failed to update handler. Please try again.');
    expect(mocks.updateEntryDetails).not.toHaveBeenCalled();
  });
});

/**
 * MYK9-665. The printed handler is `entries.handler` (free text); junior status
 * and the AKC junior handler number are read through `entries.handler_id`.
 * The caller controls whether a correction clears that load-bearing link, while
 * the read-side resolver prevents a stale link from printing the wrong person.
 *
 * Asserted on the RPC CALL ARGS, because that is the whole fix: the value of
 * `clearHandlerId` is invisible in the UI and in every rendered output.
 */
describe('MYK9-665: handler_id clearing stays caller- and role-controlled', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateEntryDetails.mockResolvedValue({ error: null });
    mocks.updateEntryHandler.mockResolvedValue({ error: null });
  });

  it.each([true, false])(
    'passes the caller tier through to the RPC untouched (clearHandlerId %p)',
    async callerTier => {
      // `handler_id` is load-bearing for the exhibitor's own
      // self check-in, the at-show queue and the "is this my entry?" predicate,
      // so this dialog must not decide to null it. The stale-link problem is
      // solved on the READ side by `resolveHandlerPerson`; the RPC applies the
      // caller's explicit clear decision with the role-safe semantics above.
      await saveEntryEdits({
        classes,
        classEdits: { 'entry-1': { handler: 'Sam Handler' } },
        clearHandlerId: callerTier,
      });

      expect(mocks.updateEntryHandler).toHaveBeenCalledWith({
        entryId: 'entry-1',
        handler: 'Sam Handler',
        handlerId: null,
        clearHandlerId: callerTier,
      });
    }
  );

  it('does not write at all when the handler did not change', () => {
    // The guard must not turn "no change" into a clearing write — that would
    // drop a correct handler_id on every unrelated save.
    return saveEntryEdits({
      classes,
      classEdits: { 'entry-1': { jumpHeight: '12"' } },
      clearHandlerId: false,
    }).then(() => {
      expect(mocks.updateEntryHandler).not.toHaveBeenCalled();
    });
  });
});
