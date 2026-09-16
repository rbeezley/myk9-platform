import { describe, expect, it, vi } from 'vitest';
import { toBulkActions } from '@/components/ui/RowActionMenu';
import { dogActions, type DogActionHandlers } from './dogActions';
import type { Dog } from '@/types/dog-types';

function dog(id: string, status: Dog['status'] = 'active'): Dog {
  return {
    id,
    name: `Dog ${id}`,
    callName: `Dog ${id}`,
    breed: 'Border Collie',
    sex: 'male',
    ownerId: 'owner-1',
    status,
  };
}

describe('dogActions bulk menu', () => {
  it('narrows the eligible subset for a status action and formats the count', () => {
    const handlers: DogActionHandlers = { onBulkSetStatus: vi.fn() };
    const dogs = [dog('1', 'active'), dog('2', 'retired'), dog('3', 'active')];
    const result = toBulkActions(dogs, handlers, dogActions);
    const retire = result.find(a => a.id === 'set-status-retired');
    expect(retire?.label).toBe('Mark 2 of 3 dogs retired');
    expect(retire?.disabled).toBe(false);
  });

  it('pluralises the "X of Y" form on the selected count, not the eligible one', () => {
    // One eligible of two selected must read "1 of 2 dogs", never "1 of 2 dog".
    const handlers: DogActionHandlers = { onBulkSetStatus: vi.fn() };
    const dogs = [dog('1', 'active'), dog('2', 'retired')];
    const retire = toBulkActions(dogs, handlers, dogActions).find(
      a => a.id === 'set-status-retired'
    );
    expect(retire?.label).toBe('Mark 1 of 2 dogs retired');
  });

  it('uses the singular when a single dog is both selected and eligible', () => {
    const handlers: DogActionHandlers = { onBulkSetStatus: vi.fn() };
    const retire = toBulkActions([dog('1', 'active')], handlers, dogActions).find(
      a => a.id === 'set-status-retired'
    );
    expect(retire?.label).toBe('Mark 1 dog retired');
  });

  it('disables a bulk status action with zero eligible items', () => {
    const handlers: DogActionHandlers = { onBulkSetStatus: vi.fn() };
    const dogs = [dog('1', 'retired'), dog('2', 'retired')];
    const result = toBulkActions(dogs, handlers, dogActions);
    const retire = result.find(a => a.id === 'set-status-retired');
    expect(retire?.disabled).toBe(true);
    expect(retire?.description).toBe('No selected dogs can be marked retired');
  });

  it('hides bulk status actions when onBulkSetStatus is not wired', () => {
    const result = toBulkActions([dog('1', 'active')], {}, dogActions);
    expect(result.find(a => a.id === 'set-status-retired')?.disabled).toBe(true);
  });

  it('dispatches the whole eligible subset to onBulkSetStatus in one call', () => {
    const onBulkSetStatus = vi.fn();
    const dogs = [dog('1', 'active'), dog('2', 'retired'), dog('3', 'active')];
    const result = toBulkActions(dogs, { onBulkSetStatus }, dogActions);
    result.find(a => a.id === 'set-status-retired')?.onSelect();
    // One call with only the eligible dogs (dog 2 is already retired) — NOT one
    // call per dog, which would trip the dispatch latch and update only the first.
    expect(onBulkSetStatus).toHaveBeenCalledTimes(1);
    expect(onBulkSetStatus).toHaveBeenCalledWith([dogs[0], dogs[2]], 'retired');
  });

  it('delete is applicable to every selected dog and dispatches via onBulkDelete', () => {
    const onBulkDelete = vi.fn();
    const dogs = [dog('1'), dog('2')];
    const result = toBulkActions(dogs, { onBulkDelete }, dogActions);
    const del = result.find(a => a.id === 'delete');
    expect(del?.label).toBe('Delete 2 dogs');
    del?.onSelect();
    expect(onBulkDelete).toHaveBeenCalledWith(dogs);
  });
});
