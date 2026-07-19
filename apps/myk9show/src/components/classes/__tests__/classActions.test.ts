import { describe, expect, it, vi } from 'vitest';
import { CLASS_STATUS } from '@myk9/core';
import { toBulkActions } from '@/components/ui/RowActionMenu';
import { classActions, type ClassActionItem, type ClassActionHandlers } from '../classActions';

function cls(id: string, status: string, name = `Class ${id}`): ClassActionItem {
  return { id, name, status };
}

describe('classActions bulk status projection (MYK9-59)', () => {
  it('projects a bulk item per status transition when onBulkStatusChange is wired', () => {
    const handlers: ClassActionHandlers = {
      onBulkStatusChange: vi.fn(),
      onBulkDelete: vi.fn(),
    };
    const items = [cls('1', CLASS_STATUS.SCHEDULED), cls('2', CLASS_STATUS.SCHEDULED)];

    const bulk = toBulkActions(items, handlers, classActions);

    const statusActionIds = Object.values(CLASS_STATUS).map(status => `set-status-${status}`);
    for (const id of statusActionIds) {
      expect(bulk.find(action => action.id === id)).toBeDefined();
    }
  });

  it('reports the eligible-of-selected count for a mixed-status selection', () => {
    const handlers: ClassActionHandlers = { onBulkStatusChange: vi.fn() };
    const items = [
      cls('1', CLASS_STATUS.SCHEDULED),
      cls('2', CLASS_STATUS.IN_PROGRESS),
      cls('3', CLASS_STATUS.SCHEDULED),
    ];

    const bulk = toBulkActions(items, handlers, classActions);
    const markInProgress = bulk.find(action => action.id === `set-status-${CLASS_STATUS.IN_PROGRESS}`);

    // Only the two Scheduled classes are eligible for "In Progress".
    expect(markInProgress?.label).toBe(`Mark 2 of 3 ${CLASS_STATUS.IN_PROGRESS}`);
    expect(markInProgress?.disabled).toBe(false);
  });

  it('disables the bulk item and shows the unavailable reason when nothing is eligible', () => {
    const handlers: ClassActionHandlers = { onBulkStatusChange: vi.fn() };
    const items = [cls('1', CLASS_STATUS.SCHEDULED)];

    const bulk = toBulkActions(items, handlers, classActions);
    const markScheduled = bulk.find(action => action.id === `set-status-${CLASS_STATUS.SCHEDULED}`);

    expect(markScheduled?.disabled).toBe(true);
    expect(markScheduled?.label).toBe(`Mark ${CLASS_STATUS.SCHEDULED}`);
    expect(markScheduled?.description).toBe(
      `No selected classes can be marked ${CLASS_STATUS.SCHEDULED}`
    );
  });

  it('treats a missing onBulkStatusChange handler as zero eligible items', () => {
    const items = [cls('1', CLASS_STATUS.SCHEDULED)];

    const bulk = toBulkActions(items, {}, classActions);
    const markInProgress = bulk.find(action => action.id === `set-status-${CLASS_STATUS.IN_PROGRESS}`);

    expect(markInProgress?.disabled).toBe(true);
  });

  it('dispatches onBulkStatusChange with the eligible ids and target status on select', async () => {
    const onBulkStatusChange = vi.fn().mockResolvedValue(true);
    const onClear = vi.fn();
    const handlers: ClassActionHandlers = { onBulkStatusChange, onClear };
    const items = [cls('1', CLASS_STATUS.SCHEDULED), cls('2', CLASS_STATUS.IN_PROGRESS)];

    const bulk = toBulkActions(items, handlers, classActions);
    const markInProgress = bulk.find(action => action.id === `set-status-${CLASS_STATUS.IN_PROGRESS}`);
    await markInProgress?.onSelect();

    expect(onBulkStatusChange).toHaveBeenCalledWith(['1'], CLASS_STATUS.IN_PROGRESS);
    expect(onClear).toHaveBeenCalled();
  });
});
