import { describe, expect, it, vi } from 'vitest';
import { toBulkActions, toRowActions } from '@/components/ui/RowActionMenu';
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

describe('dogActions row menu', () => {
  it('hides status actions matching the dog current status', () => {
    const handlers: DogActionHandlers = { onSetStatus: vi.fn() };
    const result = toRowActions(dog('1', 'active'), handlers, dogActions);
    expect(result.find(a => a.id === 'set-status-active')?.hidden).toBe(true);
    expect(result.find(a => a.id === 'set-status-retired')?.hidden).toBe(false);
    expect(result.find(a => a.id === 'set-status-deceased')?.hidden).toBe(false);
  });

  it('treats a dog with no status as active', () => {
    const handlers: DogActionHandlers = { onSetStatus: vi.fn() };
    const result = toRowActions({ ...dog('1'), status: undefined }, handlers, dogActions);
    expect(result.find(a => a.id === 'set-status-active')?.hidden).toBe(true);
  });

  it('hides status actions entirely when onSetStatus is not wired', () => {
    const result = toRowActions(dog('1', 'active'), {}, dogActions);
    expect(result.find(a => a.id === 'set-status-retired')?.hidden).toBe(true);
  });

  it('hides delete when onDelete is not wired, shows it otherwise', () => {
    const hidden = toRowActions(dog('1'), {}, dogActions).find(a => a.id === 'delete');
    expect(hidden?.hidden).toBe(true);

    const visible = toRowActions(dog('1'), { onDelete: vi.fn() }, dogActions).find(
      a => a.id === 'delete'
    );
    expect(visible?.hidden).toBe(false);
    expect(visible?.variant).toBe('destructive');
  });

  it('run calls onSetStatus with the item and target status', () => {
    const onSetStatus = vi.fn();
    const target = dog('1', 'active');
    const result = toRowActions(target, { onSetStatus }, dogActions);
    result.find(a => a.id === 'set-status-retired')?.onSelect();
    expect(onSetStatus).toHaveBeenCalledWith(target, 'retired');
  });

  it('run calls onDelete with the item', () => {
    const onDelete = vi.fn();
    const target = dog('1');
    const result = toRowActions(target, { onDelete }, dogActions);
    result.find(a => a.id === 'delete')?.onSelect();
    expect(onDelete).toHaveBeenCalledWith(target);
  });
});

describe('dogActions bulk menu', () => {
  it('narrows the eligible subset for a status action and formats the count', () => {
    const handlers: DogActionHandlers = { onBulkSetStatus: vi.fn() };
    const dogs = [dog('1', 'active'), dog('2', 'retired'), dog('3', 'active')];
    const result = toBulkActions(dogs, handlers, dogActions);
    const retire = result.find(a => a.id === 'set-status-retired');
    expect(retire?.label).toBe('Mark retired 2 of 3 selected');
    expect(retire?.disabled).toBe(false);
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
    // Bulk uses onBulkSetStatus, distinct from the row menu's per-dog onSetStatus.
    const result = toBulkActions([dog('1', 'active')], { onSetStatus: vi.fn() }, dogActions);
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
    expect(del?.label).toBe('Delete 2 of 2 selected');
    del?.onSelect();
    expect(onBulkDelete).toHaveBeenCalledWith(dogs);
  });
});
