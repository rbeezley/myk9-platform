import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Eye, Pencil, Trash2 } from 'lucide-react';
import { render } from '@/test/utils/testUtils';
import { RowActionMenu, type RowAction } from './RowActionMenu';

function makeActions(overrides: Partial<RowAction>[] = []): RowAction[] {
  const base: RowAction[] = [
    { id: 'view', label: 'View Details', icon: <Eye />, onSelect: vi.fn() },
    { id: 'edit', label: 'Edit', icon: <Pencil />, onSelect: vi.fn() },
    {
      id: 'delete',
      label: 'Delete',
      icon: <Trash2 />,
      onSelect: vi.fn(),
      variant: 'destructive',
    },
  ];
  return base.map((action, i) => ({ ...action, ...(overrides[i] ?? {}) }));
}

describe('RowActionMenu', () => {
  it('renders nothing when there are no visible actions', () => {
    const { container } = render(<RowActionMenu actions={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when every action is hidden', () => {
    const { container } = render(
      <RowActionMenu
        actions={[{ id: 'a', label: 'A', onSelect: vi.fn(), hidden: true }]}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('exposes the accessible label on the trigger', () => {
    render(<RowActionMenu actions={makeActions()} label="Actions for Fido" />);
    expect(
      screen.getByRole('button', { name: /actions for fido/i })
    ).toBeInTheDocument();
  });

  it('opens the menu and lists every visible action', async () => {
    const { user } = render(<RowActionMenu actions={makeActions()} label="Row actions" />);
    await user.click(screen.getByRole('button', { name: /row actions/i }));

    await screen.findByRole('menu');
    expect(screen.getByRole('menuitem', { name: /view details/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /edit/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /delete/i })).toBeInTheDocument();
  });

  it('invokes onSelect for the chosen action', async () => {
    const onView = vi.fn();
    const actions = makeActions([{ onSelect: onView }]);
    const { user } = render(<RowActionMenu actions={actions} />);

    await user.click(screen.getByRole('button', { name: /row actions/i }));
    await user.click(await screen.findByRole('menuitem', { name: /view details/i }));

    expect(onView).toHaveBeenCalledTimes(1);
  });

  it('omits hidden actions from the menu', async () => {
    const actions = makeActions([{}, { hidden: true }]);
    const { user } = render(<RowActionMenu actions={actions} />);

    await user.click(screen.getByRole('button', { name: /row actions/i }));
    await screen.findByRole('menu');

    expect(screen.queryByRole('menuitem', { name: /^edit$/i })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /view details/i })).toBeInTheDocument();
  });

  it('does not fire onSelect for a disabled action', async () => {
    const onDelete = vi.fn();
    const actions = makeActions([{}, {}, { onSelect: onDelete, disabled: true }]);
    const { user } = render(<RowActionMenu actions={actions} />);

    await user.click(screen.getByRole('button', { name: /row actions/i }));
    const deleteItem = await screen.findByRole('menuitem', { name: /delete/i });
    expect(deleteItem).toHaveAttribute('data-disabled');
    await user.click(deleteItem);

    expect(onDelete).not.toHaveBeenCalled();
  });

  it('styles destructive actions with the themed destructive token, not red-600', async () => {
    const { user } = render(<RowActionMenu actions={makeActions()} />);
    await user.click(screen.getByRole('button', { name: /row actions/i }));

    const deleteItem = await screen.findByRole('menuitem', { name: /delete/i });
    expect(deleteItem).toHaveClass('text-destructive');
    expect(deleteItem.className).not.toContain('text-red-600');
  });

  it('inserts a separator before the first destructive action when non-destructive items precede it', async () => {
    const { user } = render(<RowActionMenu actions={makeActions()} />);
    await user.click(screen.getByRole('button', { name: /row actions/i }));
    await screen.findByRole('menu');

    const separator = document.body.querySelector('[role="separator"]');
    const deleteItem = screen.getByRole('menuitem', { name: /delete/i });
    const editItem = screen.getByRole('menuitem', { name: /^edit$/i });
    if (!separator) throw new Error('Expected an auto separator before the destructive item');

    // separator sits after Edit and before Delete
    expect(separator.compareDocumentPosition(editItem)).toBe(Node.DOCUMENT_POSITION_PRECEDING);
    expect(separator.compareDocumentPosition(deleteItem)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('does not insert an auto separator when the destructive action is first', async () => {
    const actions: RowAction[] = [
      { id: 'delete', label: 'Delete', onSelect: vi.fn(), variant: 'destructive' },
    ];
    const { user } = render(<RowActionMenu actions={actions} />);
    await user.click(screen.getByRole('button', { name: /row actions/i }));
    await screen.findByRole('menu');

    expect(document.body.querySelector('[role="separator"]')).toBeNull();
  });

  it('honors an explicit separatorBefore on a non-destructive action', async () => {
    const actions: RowAction[] = [
      { id: 'view', label: 'View', onSelect: vi.fn() },
      { id: 'export', label: 'Export', onSelect: vi.fn(), separatorBefore: true },
    ];
    const { user } = render(<RowActionMenu actions={actions} />);
    await user.click(screen.getByRole('button', { name: /row actions/i }));
    await screen.findByRole('menu');

    expect(document.body.querySelector('[role="separator"]')).not.toBeNull();
  });

  it('renders a description as a secondary line', async () => {
    const actions: RowAction[] = [
      {
        id: 'move-up',
        label: 'Move up',
        onSelect: vi.fn(),
        disabled: true,
        description: 'No other classes are available',
      },
    ];
    const { user } = render(<RowActionMenu actions={actions} />);
    await user.click(screen.getByRole('button', { name: /row actions/i }));
    await screen.findByRole('menu');

    expect(screen.getByText('No other classes are available')).toBeInTheDocument();
  });

  it('supports controlled open state', async () => {
    const onOpenChange = vi.fn();
    render(
      <RowActionMenu actions={makeActions()} open onOpenChange={onOpenChange} />
    );
    await waitFor(() => expect(screen.getByRole('menu')).toBeInTheDocument());
  });
});
