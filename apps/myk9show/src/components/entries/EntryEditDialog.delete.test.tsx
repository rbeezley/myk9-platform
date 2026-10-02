/**
 * CRUD standard Phase 3: the entry edit sheet gets the same footer as every Edit
 * panel. "Delete entry" sits at the far left, opens the shared dialog, holds
 * Save and Cancel still while that dialog is open, and shows only to a show
 * manager: `soft_delete_entry` requires `can_manage_show`, so an exhibitor, who
 * withdraws instead, never sees it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import { EntryEditDialog } from './EntryEditDialog';

const mocks = vi.hoisted(() => ({ canModifyEntry: vi.fn() }));

vi.mock('@/lib/notifications', () => ({
  notifications: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));
vi.mock('@/services/database/entries', () => ({
  canModifyEntry: mocks.canModifyEntry,
  updateEntryDetails: vi.fn(),
  updateEntryHandler: vi.fn(),
  withdrawEntry: vi.fn(),
}));
vi.mock('./saveEntryEdits', () => ({ saveEntryEdits: vi.fn() }));
vi.mock('@/features/delete/DeleteObjectDialog', () => ({
  DeleteObjectDialog: (props: {
    kind: string;
    targets: { id: string; name: string; detail?: string }[];
    onOpenChange: (open: boolean) => void;
    onDeleted?: (result: { deleted: { id: string }[]; alreadyGone: { id: string }[] }) => void;
  }) => (
    <div role="dialog" aria-label="Delete confirmation">
      <span>
        {props.kind}:{props.targets[0]?.name}:{props.targets[0]?.detail}
      </span>
      <button onClick={() => props.onOpenChange(false)}>Keep it</button>
      <button
        onClick={() =>
          props.onDeleted?.({ deleted: [{ id: props.targets[0]?.id ?? '' }], alreadyGone: [] })
        }
      >
        Confirm delete
      </button>
    </div>
  ),
}));

const entry = {
  id: 'entry-1',
  showId: 'show-1',
  showName: 'Spring Trial',
  dogName: 'Ace',
  handler: 'Pat',
  classes: [
    {
      id: 'class-1',
      name: 'Container Novice A',
      number: '101',
      fee: 30,
      trialType: 'Scent Work',
      status: 'entered' as const,
      handler: 'Pat',
    },
  ],
};

async function renderSheet(props: Partial<React.ComponentProps<typeof EntryEditDialog>> = {}) {
  const onOpenChange = vi.fn();
  const rendered = render(
    <EntryEditDialog
      open
      entry={entry}
      onOpenChange={onOpenChange}
      onUpdate={vi.fn()}
      asShowManager
      canDelete
      {...props}
    />
  );
  await screen.findByText(/Container Novice A/);
  return { ...rendered, onOpenChange };
}

describe('EntryEditDialog footer Delete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.canModifyEntry.mockResolvedValue({ canModify: true });
  });

  it('puts Delete entry at the far left of the footer, before Cancel and Save', async () => {
    await renderSheet();
    const button = screen.getByRole('button', { name: 'Delete entry' });
    expect(button.parentElement?.firstElementChild).toBe(button);
    expect(button.parentElement).toContainElement(screen.getByRole('button', { name: 'Cancel' }));
    expect(button.parentElement).toContainElement(
      screen.getByRole('button', { name: /save changes/i })
    );
  });

  it('is absent for an exhibitor, who withdraws rather than deletes', async () => {
    await renderSheet({ asShowManager: false, canDelete: false });
    // Positive control: the footer rendered.
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^delete/i })).not.toBeInTheDocument();
  });

  it('is absent when the host does not resolve a manage gate for this show (a show-scoped secretary)', async () => {
    // asShowManager only says "this is the manager surface"; it is not the delete gate.
    await renderSheet({ asShowManager: true, canDelete: false });
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^delete/i })).not.toBeInTheDocument();
  });

  it('opens the shared dialog naming the entry, handler and class', async () => {
    const { user } = await renderSheet();
    await user.click(screen.getByRole('button', { name: 'Delete entry' }));
    expect(screen.getByText(/^entry:Ace:/)).toHaveTextContent('Ace');
    expect(screen.getByText(/^entry:Ace:/)).toHaveTextContent('Container Novice A');
  });

  it('holds Cancel and Save still while the dialog is open, and frees them on Keep it', async () => {
    const { user, onOpenChange } = await renderSheet();
    await user.type(screen.getByDisplayValue('Pat'), 'ty');
    await user.click(screen.getByRole('button', { name: 'Delete entry' }));

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();
    await user.keyboard('{Escape}');
    expect(onOpenChange).not.toHaveBeenCalledWith(false);

    await user.click(screen.getByRole('button', { name: 'Keep it' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled());
  });

  it('closes the sheet without a discard prompt and reports the deleted ids', async () => {
    const onDeleted = vi.fn();
    const { user, onOpenChange } = await renderSheet({ onDeleted });
    await user.type(screen.getByDisplayValue('Pat'), 'ty');
    await user.click(screen.getByRole('button', { name: 'Delete entry' }));
    await user.click(screen.getByRole('button', { name: 'Confirm delete' }));

    expect(onDeleted).toHaveBeenCalledWith(['entry-1']);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.queryByText('Discard changes?')).not.toBeInTheDocument();
  });
});
