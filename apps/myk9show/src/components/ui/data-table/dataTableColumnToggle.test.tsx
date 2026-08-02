/**
 * The column toggle must portal, and must stay open across several toggles.
 *
 * It previously pinned its popup with `absolute top-full`, the same defect
 * measured on /club-admin/members where 553px of a menu fell below the fold.
 * On a table whose toolbar sits low in a short viewport, the columns near the
 * end of the list were unreachable.
 *
 * The staying-open part is not incidental: hiding four columns should be one
 * trip, not four. The hand-rolled version behaved that way because its rows
 * were plain `<label>`s that never closed anything, so `closeOnClick={false}`
 * is preserving behaviour rather than inventing it — and nothing else would
 * catch its loss.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { DataTable, type ColumnDef } from './index';

interface Row {
  name: string;
  email: string;
  status: string;
}

const data: Row[] = [{ name: 'Ada', email: 'ada@example.com', status: 'Active' }];

const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'email', header: 'Email' },
  { accessorKey: 'status', header: 'Status' },
];

// `tableId` is what makes DataTable render its default toolbar, which is where
// the column toggle lives.
function renderToggle() {
  return render(<DataTable tableId="toggle-test" columns={columns} data={data} />);
}

const openToggle = async (user: ReturnType<typeof renderToggle>['user']) => {
  await user.click(screen.getByRole('button', { name: /toggle columns/i }));
  return screen.findByRole('menu');
};

describe('DataTableColumnToggle', () => {
  it('renders the popup outside the toolbar subtree', async () => {
    const { user, container } = renderToggle();
    const menu = await openToggle(user);

    // Inline under the trigger means pinned to it and unable to escape the fold.
    expect(container.contains(menu)).toBe(false);
    expect(document.body.contains(menu)).toBe(true);
  });

  it('exposes each column as a real checkbox item', async () => {
    const { user } = renderToggle();
    await openToggle(user);

    // `<label tabIndex={0}>` inside a role="menu" claimed a keyboard contract
    // it never implemented; these are the real thing.
    expect(await screen.findAllByRole('menuitemcheckbox')).toHaveLength(3);
  });

  it('stays open so several columns can be toggled in one pass', async () => {
    const { user } = renderToggle();
    await openToggle(user);

    await user.click(await screen.findByRole('menuitemcheckbox', { name: 'Name' }));
    // The menu must survive the first toggle, or hiding four columns costs
    // four round trips.
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await user.click(screen.getByRole('menuitemcheckbox', { name: 'Email' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('actually hides the column it toggles', async () => {
    const { user } = renderToggle();
    await openToggle(user);

    expect(screen.getByRole('columnheader', { name: 'Email' })).toBeInTheDocument();
    await user.click(await screen.findByRole('menuitemcheckbox', { name: 'Email' }));
    expect(screen.queryByRole('columnheader', { name: 'Email' })).not.toBeInTheDocument();
  });
});
