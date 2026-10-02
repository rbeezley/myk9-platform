import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import type { RowAction } from '@/components/ui/RowActionMenu';
import { BulkBarActions } from '../BulkBarActions';
import { FloatingBulkBar } from '../FloatingBulkBar';
import { buildCsv } from '@/utils/downloadCsv';

// MYK9-929, M10: bulk actions are named buttons on every list, never a bare ⋮ "Bulk actions".

function setup(actions: RowAction[]) {
  return render(
    <FloatingBulkBar count={2} noun={['dog', 'dogs']} onClear={vi.fn()}>
      <BulkBarActions actions={actions} menuLabel="Change status" />
    </FloatingBulkBar>
  );
}

describe('BulkBarActions', () => {
  it('groups the non-destructive actions under one named menu button', async () => {
    const onSelect = vi.fn();
    const { user } = setup([
      { id: 'a', label: 'Mark active', onSelect },
      { id: 'b', label: 'Mark retired', onSelect: vi.fn() },
    ]);

    expect(screen.queryByRole('button', { name: /bulk actions/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Change status' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Mark active' }));
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it('puts a destructive action on its own named button, last, with the full wording as its tooltip', async () => {
    const onDelete = vi.fn();
    const { user } = setup([
      { id: 'a', label: 'Mark active', onSelect: vi.fn() },
      { id: 'delete', label: 'Delete 2 of 3 selected', variant: 'destructive', onSelect: onDelete },
    ]);

    const button = screen.getByRole('button', { name: 'Delete' });
    expect(button).toHaveAttribute('title', 'Delete 2 of 3 selected');
    await user.click(button);
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it('disables a named button whose action has nothing to act on', () => {
    setup([
      { id: 'delete', label: 'Delete', variant: 'destructive', disabled: true, onSelect: vi.fn() },
    ]);
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  });

  it('shows no menu button when there are no menu actions', () => {
    setup([{ id: 'delete', label: 'Delete', variant: 'destructive', onSelect: vi.fn() }]);
    expect(screen.queryByRole('button', { name: 'Change status' })).not.toBeInTheDocument();
  });
});

describe('buildCsv', () => {
  it('quotes commas, quotes and line breaks, and leaves blanks empty', () => {
    expect(
      buildCsv([
        ['Name', 'Note'],
        ['Rex, Jr.', 'says "hi"'],
        ['Fido', null],
      ])
    ).toBe('Name,Note\n"Rex, Jr.","says ""hi"""\nFido,');
  });
});
