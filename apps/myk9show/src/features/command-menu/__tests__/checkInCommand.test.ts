import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildCheckInCommand } from '../checkInCommand';
import { entryActions } from '@/components/entries/management/entryActions';
import type { EntityAction } from '@/components/ui/RowActionMenu/entityActions';
import type { EntryActionHandlers } from '@/components/entries/management/entryActions';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import type { CommandMenuContext } from '../commandMenuTypes';
import {
  registerCommandMenuContext,
  useCommandMenuContextStore,
} from '../commandMenuContextStore';

type Registry = ReadonlyArray<EntityAction<EntryManagementEntry, EntryActionHandlers>>;

function baseCtx(overrides: Partial<CommandMenuContext> = {}): CommandMenuContext {
  return {
    surface: 'entry-management',
    showId: 'show-1',
    selectedEntryIds: ['e1', 'e2'],
    eligibleCheckInIds: ['e1'],
    runBulkCheckIn: vi.fn(),
    busy: false,
    ...overrides,
  };
}

describe('buildCheckInCommand', () => {
  it('derives id/label from the same entryActions registry entry', () => {
    const checkInAction = entryActions.find(action => action.id === 'check-in');
    expect(checkInAction?.bulk).toBeDefined();

    const ctx = baseCtx();
    const command = buildCheckInCommand(ctx, entryActions);

    expect(command).not.toBeNull();
    expect(command?.id).toBe('check-in');
    expect(command?.label).toBe(checkInAction!.bulk!.label(1, 2));
  });

  it('is absent when the registry has no check-in entry', () => {
    const registryWithoutCheckIn: Registry = entryActions.filter(
      action => action.id !== 'check-in'
    );
    const command = buildCheckInCommand(baseCtx(), registryWithoutCheckIn);
    expect(command).toBeNull();
  });

  it('is absent when ctx is null', () => {
    expect(buildCheckInCommand(null, entryActions)).toBeNull();
  });

  it('is absent for the wrong surface', () => {
    // Cast: only 'entry-management' exists today, but the check must still
    // reject any non-matching surface value defensively.
    const ctx = baseCtx({ surface: 'other-surface' as CommandMenuContext['surface'] });
    expect(buildCheckInCommand(ctx, entryActions)).toBeNull();
  });

  it('is absent when selection is empty', () => {
    const ctx = baseCtx({ selectedEntryIds: [], eligibleCheckInIds: [] });
    expect(buildCheckInCommand(ctx, entryActions)).toBeNull();
  });

  it('is absent when there are zero eligible entries', () => {
    const ctx = baseCtx({ eligibleCheckInIds: [] });
    expect(buildCheckInCommand(ctx, entryActions)).toBeNull();
  });

  it('is absent when busy', () => {
    const ctx = baseCtx({ busy: true });
    expect(buildCheckInCommand(ctx, entryActions)).toBeNull();
  });

  it('run() invokes the registered handler with exactly the eligible ids', async () => {
    const runBulkCheckIn = vi.fn().mockResolvedValue(undefined);
    const ctx = baseCtx({
      selectedEntryIds: ['e1', 'e2', 'e3'],
      eligibleCheckInIds: ['e1', 'e3'],
      runBulkCheckIn,
    });
    const command = buildCheckInCommand(ctx, entryActions);
    expect(command).not.toBeNull();

    await command?.run?.();

    expect(runBulkCheckIn).toHaveBeenCalledTimes(1);
    expect(runBulkCheckIn).toHaveBeenCalledWith(['e1', 'e3']);
  });

  // Task 3.3 — dispatch-failure behavior. `ctx.runBulkCheckIn` is the page's
  // real `handleEnrollmentBulkCheckIn` (via `useBulkDispatch`, tested
  // separately in useBulkDispatch.test.ts), which already owns
  // plain-language failure feedback (toast.error with a "Retry failed"
  // action) and in-flight dedup (useRef latch). The command layer's job is
  // just to propagate/settle without swallowing that signal, and to stop
  // offering the command at all while busy — asserted here.
  it('propagates a rejected runBulkCheckIn without throwing synchronously and without swallowing the failure', async () => {
    const runBulkCheckIn = vi.fn().mockRejectedValue(new Error('check-in failed'));
    const ctx = baseCtx({ runBulkCheckIn });
    const command = buildCheckInCommand(ctx, entryActions);
    expect(command).not.toBeNull();

    // Calling run() must not throw synchronously — it hands back the
    // rejected promise for the caller (the palette adapter) to await.
    let result: void | Promise<unknown> | undefined;
    expect(() => {
      result = command?.run?.();
    }).not.toThrow();

    await expect(result).rejects.toThrow('check-in failed');
    expect(runBulkCheckIn).toHaveBeenCalledTimes(1);
  });

  it('does not swallow a failure-shaped (non-throwing) result — it is returned as-is to the caller', async () => {
    const failureResult = { succeeded: [], failed: [{ item: 'e1', reason: 'network error' }] };
    const runBulkCheckIn = vi.fn().mockResolvedValue(failureResult);
    const ctx = baseCtx({ runBulkCheckIn });
    const command = buildCheckInCommand(ctx, entryActions);

    const result = await command?.run?.();

    // run() is a thin passthrough (`() => ctx.runBulkCheckIn(eligibleIds)`) —
    // it does not intercept, unwrap, or reshape runBulkCheckIn's resolved
    // value, so the failure shape reaches the caller (the palette adapter)
    // unaltered.
    expect(result).toBe(failureResult);
    expect(runBulkCheckIn).toHaveBeenCalledWith(['e1']);
  });

  it('a busy context yields no command at all — the palette cannot dispatch a second time while one is in flight', () => {
    const runBulkCheckIn = vi.fn();
    const notBusy = buildCheckInCommand(baseCtx({ runBulkCheckIn, busy: false }), entryActions);
    expect(notBusy).not.toBeNull();

    const whileBusy = buildCheckInCommand(baseCtx({ runBulkCheckIn, busy: true }), entryActions);
    expect(whileBusy).toBeNull();
  });
});

describe('commandMenuContextStore', () => {
  beforeEach(() => {
    useCommandMenuContextStore.setState({ context: null, token: 0 });
  });

  it('registers and unregisters a context', () => {
    const ctx = baseCtx();
    const unregister = registerCommandMenuContext(ctx);

    expect(useCommandMenuContextStore.getState().context).toBe(ctx);

    unregister();

    expect(useCommandMenuContextStore.getState().context).toBeNull();
  });

  it('last-write-wins: a newer registration supersedes an earlier one', () => {
    const ctxA = baseCtx({ showId: 'show-a' });
    const ctxB = baseCtx({ showId: 'show-b' });

    registerCommandMenuContext(ctxA);
    registerCommandMenuContext(ctxB);

    expect(useCommandMenuContextStore.getState().context).toBe(ctxB);
  });

  it('a stale unregister does not clear a newer registration', () => {
    const ctxA = baseCtx({ showId: 'show-a' });
    const ctxB = baseCtx({ showId: 'show-b' });

    const unregisterA = registerCommandMenuContext(ctxA);
    registerCommandMenuContext(ctxB);

    unregisterA();

    expect(useCommandMenuContextStore.getState().context).toBe(ctxB);
  });
});
