import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { render } from '@/test/utils/testUtils';
import { EditPanelWrapper, type EditPanelDeleteOption } from '../EditPanelWrapper';
import { useEditPanel } from '../useEditPanel';

// The shared dialog is covered by its own suite; here it is a stand-in that
// reports being open and lets the test drive its callbacks.
vi.mock('@/features/delete', () => ({
  DeleteObjectDialog: (props: {
    open: boolean;
    kind: string;
    targets: { name: string }[];
    onOpenChange: (open: boolean) => void;
    onDeleted?: (result: unknown) => void;
  }) =>
    props.open ? (
      <div role="dialog" aria-label="Delete confirmation">
        <span>
          {props.kind}:{props.targets[0]?.name}
        </span>
        <button onClick={() => props.onOpenChange(false)}>Keep it</button>
        <button onClick={() => props.onDeleted?.({ deleted: [{}], alreadyGone: [], failed: [] })}>
          Confirm delete
        </button>
      </div>
    ) : null,
}));

const schema = z.object({ name: z.string().min(1) });

function Fields() {
  const { form } = useEditPanel<{ name: string }>();
  if (!form) return null;
  return (
    <input
      aria-label="Name"
      value={form.data.name}
      onChange={e => form.setValue('name', e.target.value)}
    />
  );
}

const deleteOption = (extra: Partial<EditPanelDeleteOption> = {}): EditPanelDeleteOption => ({
  kind: 'show',
  objectLabel: 'show',
  targets: [{ id: 's1', name: 'Heartland Classic' }],
  ...extra,
});

function renderPanel(extra: Record<string, unknown> = {}, variant: 'panel' | 'dialog' = 'dialog') {
  const onClose = vi.fn();
  render(
    <EditPanelWrapper
      open
      onClose={onClose}
      title="Edit"
      initialData={{ name: 'Rex' }}
      schema={schema}
      onSave={vi.fn()}
      variant={variant}
      {...extra}
    >
      <Fields />
    </EditPanelWrapper>
  );
  return { onClose };
}

describe.each(['dialog', 'panel'] as const)('EditPanelWrapper delete footer (%s)', variant => {
  it('renders Delete ‹object› as the first thing in the footer row', () => {
    renderPanel({ onDelete: deleteOption() }, variant);
    const row = screen.getByTestId('edit-panel-action-row');
    const button = within(row).getByRole('button', { name: 'Delete show' });
    expect(row.firstElementChild).toBe(button);
  });

  it('renders nothing without onDelete (create mode, or a viewer who cannot delete)', () => {
    renderPanel({}, variant);
    expect(screen.queryByRole('button', { name: /^delete/i })).not.toBeInTheDocument();
  });

  it('opens the shared dialog naming the kind and the item', async () => {
    const user = userEvent.setup();
    renderPanel({ onDelete: deleteOption() }, variant);
    expect(screen.queryByRole('dialog', { name: 'Delete confirmation' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete show' }));
    expect(screen.getByText('show:Heartland Classic')).toBeInTheDocument();
  });

  it('blocks Save and Cancel while the delete dialog is open, and frees them on Keep it', async () => {
    const user = userEvent.setup();
    const { onClose } = renderPanel({ onDelete: deleteOption() }, variant);
    await user.type(screen.getByLabelText('Name'), 'y');
    await user.click(screen.getByRole('button', { name: 'Delete show' }));
    const row = screen.getByTestId('edit-panel-action-row');
    expect(within(row).getByRole('button', { name: /save changes/i })).toBeDisabled();
    expect(within(row).getByRole('button', { name: /cancel/i })).toBeDisabled();
    expect(within(row).getByRole('button', { name: 'Delete show' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(within(row).getByRole('button', { name: /save changes/i })).toBeEnabled();
    expect(within(row).getByRole('button', { name: /cancel/i })).toBeEnabled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes the panel without a discard prompt, then reports the delete, once it is deleted', async () => {
    const user = userEvent.setup();
    const onDeleted = vi.fn();
    const { onClose } = renderPanel({ onDelete: deleteOption({ onDeleted }) }, variant);
    await user.type(screen.getByLabelText('Name'), 'y');
    await user.click(screen.getByRole('button', { name: 'Delete show' }));
    await user.click(screen.getByRole('button', { name: 'Confirm delete' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onDeleted).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/discard/i)).not.toBeInTheDocument();
  });
});
