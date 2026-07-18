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
