import { describe, expect, it, vi } from 'vitest';
import { toBulkActions, toRowActions, type EntityAction } from './entityActions';

interface Item {
  id: string;
  status: 'open' | 'closed';
}

interface Handlers {
  onRun?: (item: Item) => void;
  onBulkRun?: (items: Item[]) => void;
}

const openOnly: EntityAction<Item, Handlers>[] = [
  {
    id: 'activate',
    label: item => (item.status === 'open' ? 'Already active' : 'Activate'),
    applicableWhen: (item, handlers) => item.status === 'closed' && Boolean(handlers.onRun),
    run: (item, handlers) => handlers.onRun?.(item),
    bulk: {
      label: eligibleCount =>
        eligibleCount > 0 ? `Activate selected (${eligibleCount})` : 'Activate selected',
      unavailableReason: 'No selected items can be activated',
      run: (eligible, handlers) => handlers.onBulkRun?.(eligible),
    },
  },
  {
    id: 'no-bulk',
    label: 'Row only',
    applicableWhen: () => true,
    run: () => undefined,
  },
];

describe('toRowActions', () => {
  it('hides actions whose applicableWhen returns false', () => {
    const result = toRowActions({ id: '1', status: 'open' }, { onRun: vi.fn() }, openOnly);
    expect(result.find(a => a.id === 'activate')?.hidden).toBe(true);
  });

  it('shows applicable actions and resolves function labels against the item', () => {
    const result = toRowActions({ id: '1', status: 'closed' }, { onRun: vi.fn() }, openOnly);
    const activate = result.find(a => a.id === 'activate');
    expect(activate?.hidden).toBe(false);
    expect(activate?.label).toBe('Activate');
  });

  it('treats a missing handler as inapplicable', () => {
    const result = toRowActions({ id: '1', status: 'closed' }, {}, openOnly);
    expect(result.find(a => a.id === 'activate')?.hidden).toBe(true);
  });

  it('wires onSelect to call run with the item and handlers', () => {
    const onRun = vi.fn();
    const item = { id: '1', status: 'closed' } as Item;
    const result = toRowActions(item, { onRun }, openOnly);
    result.find(a => a.id === 'activate')?.onSelect();
    expect(onRun).toHaveBeenCalledWith(item);
  });

  it('omits actions with no bulk config from bulk projection', () => {
    const result = toBulkActions([{ id: '1', status: 'closed' }], {}, openOnly);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('activate');
  });
});

describe('toBulkActions', () => {
  const items: Item[] = [
    { id: '1', status: 'closed' },
    { id: '2', status: 'open' },
    { id: '3', status: 'closed' },
  ];

  it('projects the eligible-of-selected count into the label', () => {
    const result = toBulkActions(items, { onRun: vi.fn() }, openOnly);
    const activate = result.find(a => a.id === 'activate');
    expect(activate?.label).toBe('Activate selected (2)');
  });

  it('disables and surfaces unavailableReason as description when zero are eligible', () => {
    const allOpen: Item[] = [{ id: '1', status: 'open' }];
    const result = toBulkActions(allOpen, {}, openOnly);
    const activate = result.find(a => a.id === 'activate');
    expect(activate?.disabled).toBe(true);
    expect(activate?.description).toBe('No selected items can be activated');
    expect(activate?.label).toBe('Activate selected');
  });

  it('is enabled with no description once at least one item is eligible', () => {
    const result = toBulkActions(items, { onRun: vi.fn() }, openOnly);
    const activate = result.find(a => a.id === 'activate');
    expect(activate?.disabled).toBe(false);
    expect(activate?.description).toBeUndefined();
  });

  it('runs bulk.run with only the eligible items', () => {
    const onBulkRun = vi.fn();
    const result = toBulkActions(items, { onRun: vi.fn(), onBulkRun }, openOnly);
    result.find(a => a.id === 'activate')?.onSelect();
    expect(onBulkRun).toHaveBeenCalledWith([items[0], items[2]]);
  });

  it('uses bulk.applicableWhen instead of applicableWhen when provided', () => {
    const custom: EntityAction<Item, Handlers>[] = [
      {
        id: 'custom',
        label: 'Custom',
        applicableWhen: item => item.status === 'closed',
        run: () => undefined,
        bulk: {
          applicableWhen: item => item.status === 'open',
          label: count => `Custom (${count})`,
          run: () => undefined,
        },
      },
    ];

    const result = toBulkActions(items, {}, custom);
    expect(result[0]?.label).toBe('Custom (1)');
  });
});
