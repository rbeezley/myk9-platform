import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, userEvent } from '@/test/utils/testUtils';
import { ListFilterBar } from '../ListFilterBar';
import type { ListDateRange, ListFilterField } from '../types';

function roleField(value: string | null, onChange = vi.fn()): ListFilterField {
  return {
    kind: 'options',
    key: 'role',
    label: 'Role',
    value,
    onChange,
    options: [
      { value: 'judge', label: 'Judge', count: 12 },
      { value: 'secretary', label: 'Secretary', count: 3 },
    ],
  };
}

function createdField(value: ListDateRange, onChange = vi.fn()): ListFilterField {
  return { kind: 'dateRange', key: 'created', label: 'Created', value, onChange };
}

function renderBar(
  fields: ListFilterField[],
  extra: { search?: string; onClearAll?: () => void } = {}
) {
  return render(
    <ListFilterBar
      searchValue={extra.search ?? ''}
      onSearchChange={vi.fn()}
      searchPlaceholder="Search people"
      fields={fields}
      {...(extra.onClearAll ? { onClearAll: extra.onClearAll } : {})}
    />
  );
}

describe('ListFilterBar', () => {
  it('shows an active field as a "Field: value" chip and removes it with its own button', async () => {
    const onChange = vi.fn();
    renderBar([roleField('judge', onChange)]);

    expect(screen.getByRole('button', { name: 'Role: Judge. Change' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove role filter' }));

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('shows a stale value raw, so a filter the list no longer offers stays visible and removable', () => {
    renderBar([roleField('steward')]);
    expect(screen.getByRole('button', { name: 'Role: steward. Change' })).toBeInTheDocument();
  });

  it('offers only inactive fields under "+ Filter", with counts, and applies a pick', async () => {
    const onChange = vi.fn();
    renderBar([
      roleField(null, onChange),
      createdField({ start: new Date(2026, 0, 1), end: null }),
    ]);

    await userEvent.click(screen.getByRole('button', { name: 'Filter' }));
    const menu = screen.getByRole('group', { name: 'Filter by' });
    // Created is already a chip, so it is not offered again.
    expect(
      within(menu)
        .getAllByRole('button')
        .map(b => b.textContent)
    ).toEqual(['Role']);

    await userEvent.click(within(menu).getByRole('button', { name: 'Role' }));
    const options = screen.getByRole('group', { name: 'Role' });
    expect(within(options).getByRole('button', { name: /Judge\s*12/ })).toBeInTheDocument();
    await userEvent.click(within(options).getByRole('button', { name: /Secretary/ }));

    expect(onChange).toHaveBeenCalledWith('secretary');
  });

  it('picking the selected option again clears it', async () => {
    const onChange = vi.fn();
    renderBar([roleField('judge', onChange)]);

    await userEvent.click(screen.getByRole('button', { name: 'Role: Judge. Change' }));
    const judge = within(screen.getByRole('group', { name: 'Role' })).getByRole('button', {
      name: /Judge/,
    });
    expect(judge).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(judge);

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('edits a date range as local calendar days, keeping the other end', async () => {
    const onChange = vi.fn();
    const end = new Date(2026, 5, 30);
    renderBar([createdField({ start: null, end }, onChange)]);

    await userEvent.click(screen.getByRole('button', { name: /^Created: before/ }));
    const from = screen.getByLabelText('From');
    await userEvent.type(from, '2026-06-01');

    const last = onChange.mock.calls.at(-1)?.[0] as ListDateRange;
    expect(last.end).toBe(end);
    expect(last.start?.getFullYear()).toBe(2026);
    expect(last.start?.getMonth()).toBe(5);
    expect(last.start?.getDate()).toBe(1);
  });

  it('removing a date-range chip clears both ends', async () => {
    const onChange = vi.fn();
    renderBar([createdField({ start: new Date(2026, 0, 1), end: new Date(2026, 1, 1) }, onChange)]);
    await userEvent.click(screen.getByRole('button', { name: 'Remove created filter' }));
    expect(onChange).toHaveBeenCalledWith({ start: null, end: null });
  });

  it('shows "Clear all" only while a search or filter is active', async () => {
    const onClearAll = vi.fn();
    const { unmount } = renderBar([roleField(null)], { onClearAll });
    expect(screen.queryByRole('button', { name: 'Clear all' })).not.toBeInTheDocument();
    unmount();

    renderBar([roleField(null)], { onClearAll, search: 'ada' });
    await userEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(onClearAll).toHaveBeenCalledOnce();
  });
});
