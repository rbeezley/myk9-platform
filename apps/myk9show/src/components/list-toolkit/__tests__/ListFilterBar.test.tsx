import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, userEvent } from '@/test/utils/testUtils';
import { ListFilterBar } from '../ListFilterBar';
import type { ListDateRange, ListFilterField, ListOptionsFilterField } from '../types';

function roleField(value: string | null, onChange = vi.fn()): ListOptionsFilterField {
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

function createdField(
  value: ListDateRange,
  onChange: (value: ListDateRange) => void = vi.fn()
): ListFilterField {
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
  it('shows every field up front as a labelled select, with no "+ Filter" menu', () => {
    renderBar([roleField(null), createdField({ start: null, end: null })]);

    expect(screen.getByRole('combobox', { name: 'Role' })).toHaveTextContent('Any role');
    expect(screen.getByRole('button', { name: /^Created: any time/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Filter' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Remove/ })).not.toBeInTheDocument();
  });

  it('applies a pick, with counts in the option text', async () => {
    const onChange = vi.fn();
    renderBar([roleField(null, onChange)]);

    await userEvent.click(screen.getByRole('combobox', { name: 'Role' }));
    expect(await screen.findByRole('option', { name: 'Judge (12)' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('option', { name: 'Secretary (3)' }));

    expect(onChange).toHaveBeenCalledWith('secretary');
  });

  it('keeps every option a 44px target', async () => {
    renderBar([roleField('steward')]);
    await userEvent.click(screen.getByRole('combobox', { name: 'Role' }));
    const options = await screen.findAllByRole('option');
    expect(options).toHaveLength(4); // Any, stale value, two options
    for (const option of options) expect(option.className).toContain('min-h-11');
  });

  it('picking the "all" option clears the field', async () => {
    const onChange = vi.fn();
    renderBar([roleField('judge', onChange)]);

    const select = screen.getByRole('combobox', { name: 'Role' });
    expect(select).toHaveTextContent('Judge (12)');
    await userEvent.click(select);
    await userEvent.click(await screen.findByRole('option', { name: 'Any role' }));

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("uses a field's own wording for the unfiltered option", () => {
    renderBar([{ ...roleField(null), allLabel: 'All roles' }]);
    expect(screen.getByRole('combobox', { name: 'Role' })).toHaveTextContent('All roles');
  });

  it('shows a stale value raw, so a filter the list no longer offers stays visible', () => {
    renderBar([roleField('steward')]);
    expect(screen.getByRole('combobox', { name: 'Role' })).toHaveTextContent('steward');
  });

  it('edits a date range as local calendar days, keeping the other end', async () => {
    const onChange = vi.fn();
    const end = new Date(2026, 5, 30);
    renderBar([createdField({ start: null, end }, onChange)]);

    await userEvent.click(screen.getByRole('button', { name: /^Created: before/ }));
    await userEvent.type(screen.getByLabelText('From'), '2026-06-01');

    const last = onChange.mock.calls.at(-1)?.[0] as ListDateRange;
    expect(last.end).toBe(end);
    expect(last.start?.getFullYear()).toBe(2026);
    expect(last.start?.getMonth()).toBe(5);
    expect(last.start?.getDate()).toBe(1);
  });

  // Codex P2 (2ebcad645): setting the first bound makes the field active; the
  // editor must not vanish before the second bound can be entered.
  it('keeps the date editor open after the first bound is set', async () => {
    function Harness() {
      const [range, setRange] = useState<ListDateRange>({ start: null, end: null });
      return (
        <ListFilterBar
          searchValue=""
          onSearchChange={vi.fn()}
          searchPlaceholder="Search people"
          fields={[createdField(range, setRange)]}
        />
      );
    }
    render(<Harness />);

    await userEvent.click(screen.getByRole('button', { name: /^Created: any time/ }));
    await userEvent.type(screen.getByLabelText('From'), '2026-06-01');

    expect(screen.getByLabelText('To')).toBeInTheDocument();
  });

  it('"Any time" clears both ends of an active date range', async () => {
    const onChange = vi.fn();
    renderBar([createdField({ start: new Date(2026, 0, 1), end: new Date(2026, 1, 1) }, onChange)]);
    await userEvent.click(screen.getByRole('button', { name: /^Created:/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Any time' }));
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
