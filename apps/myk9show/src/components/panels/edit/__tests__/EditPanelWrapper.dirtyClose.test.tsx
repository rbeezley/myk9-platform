/**
 * MYK9-1081 (PR #2920 review): a dirty panel-variant edit form asks before it
 * closes. Escape, the backdrop and the X all reach the wrapper's close request,
 * which raises "Discard changes?" when there are edits, exactly as Cancel and
 * the inline variant's host do. Only an open delete confirm blocks closing
 * outright (MYK9-910: Escape on that confirm must not close the panel too).
 */
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { z } from 'zod';
import { render } from '@/test/utils/testUtils';
import { EditPanelWrapper } from '../EditPanelWrapper';
import { useEditPanel } from '../useEditPanel';

vi.mock('@/features/delete', () => ({
  DeleteObjectDialog: (props: { open: boolean; onOpenChange: (open: boolean) => void }) =>
    props.open ? (
      <div role="alertdialog" aria-label="Delete confirmation">
        <button onClick={() => props.onOpenChange(false)}>Keep it</button>
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

function Harness({ withDelete = false }: { withDelete?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Edit dog</button>
      <EditPanelWrapper
        open={open}
        onClose={() => setOpen(false)}
        title="Edit Dog"
        initialData={{ name: 'Rex' }}
        schema={schema}
        onSave={vi.fn()}
        {...(withDelete && {
          onDelete: { kind: 'dog', objectLabel: 'dog', targets: [{ id: 'd1', name: 'Rex' }] },
        })}
      >
        <Fields />
      </EditPanelWrapper>
    </>
  );
}

const overlay = () => screen.getByRole('dialog', { name: 'Edit Dog' });
const prompt = () => screen.queryByRole('alertdialog', { name: 'Discard changes?' });

async function openDirty(withDelete = false) {
  const rendered = render(<Harness withDelete={withDelete} />);
  const opener = screen.getByRole('button', { name: 'Edit dog' });
  opener.focus();
  await rendered.user.click(opener);
  await rendered.user.type(screen.getByLabelText('Name'), 'y');
  return { ...rendered, opener };
}

describe('a dirty panel-variant edit form asks before closing', () => {
  it('Escape raises the prompt and keeps the edit; Keep editing keeps the form', async () => {
    const { user } = await openDirty();
    await user.keyboard('{Escape}');

    expect(await screen.findByRole('alertdialog', { name: 'Discard changes?' })).toBeVisible();
    expect(screen.getByLabelText('Name')).toHaveValue('Rexy');

    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    await waitFor(() => expect(prompt()).toBeNull());
    expect(screen.getByLabelText('Name')).toHaveValue('Rexy');
    expect(overlay()).toBeInTheDocument();
  });

  it('keeps the X visible, and the X raises the prompt', async () => {
    const { user } = await openDirty();
    await user.click(screen.getByRole('button', { name: /close panel/i }));
    expect(await screen.findByRole('alertdialog', { name: 'Discard changes?' })).toBeVisible();
    expect(screen.getByLabelText('Name')).toHaveValue('Rexy');
  });

  it('a backdrop click raises the prompt', async () => {
    await openDirty();
    fireEvent.click(overlay());
    expect(await screen.findByRole('alertdialog', { name: 'Discard changes?' })).toBeVisible();
    expect(screen.getByLabelText('Name')).toHaveValue('Rexy');
  });

  it('a backdrop click, then Escape on the prompt, raises one prompt and keeps the form', async () => {
    const { user } = await openDirty();
    fireEvent.click(overlay());
    await screen.findByRole('alertdialog', { name: 'Discard changes?' });
    expect(screen.getAllByRole('alertdialog')).toHaveLength(1);

    await user.keyboard('{Escape}');
    await waitFor(() => expect(prompt()).toBeNull());
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(prompt()).toBeNull();
    expect(screen.getByLabelText('Name')).toHaveValue('Rexy');
  });

  it('Discard closes the panel and returns focus to its opener', async () => {
    const { user, opener } = await openDirty();
    await user.keyboard('{Escape}');
    await user.click(await screen.findByRole('button', { name: 'Discard changes' }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit Dog' })).toBeNull(), {
      timeout: 2000,
    });
    await waitFor(() => expect(document.activeElement).toBe(opener), { timeout: 2000 });
  });

  it('with the delete confirm open, Escape and the backdrop do not close the panel', async () => {
    const { user } = await openDirty(true);
    await user.click(screen.getByRole('button', { name: 'Delete dog' }));
    expect(screen.getByRole('alertdialog', { name: 'Delete confirmation' })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(overlay());
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(overlay()).toBeInTheDocument();
    expect(prompt()).toBeNull();
    expect(screen.getByLabelText('Name')).toHaveValue('Rexy');
  });
});
