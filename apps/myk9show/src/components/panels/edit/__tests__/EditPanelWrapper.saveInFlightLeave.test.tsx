/**
 * MYK9-1125: a save that never settles (an online-only request that lost its
 * connection, or one that simply hangs) must not trap the person in the panel.
 * Cancel, Escape, the X and an inline host's Back all ask "Still saving" and
 * can leave; the save keeps running, and its late result is toasted so a write
 * the person walked away from is never silent.
 */
import { useRef, useState } from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { render } from '@/test/utils/testUtils';
import { EditPanelWrapper } from '../EditPanelWrapper';
import { useEditPanel } from '../useEditPanel';

const mocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('@/lib/notifications', () => ({
  notifications: { success: mocks.success, error: mocks.error, warning: vi.fn(), info: vi.fn() },
}));
vi.mock('@/services/LoggingService', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), debug: vi.fn(), info: vi.fn() },
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

/** A save the test settles by hand; until then it hangs like a paused mutation. */
function deferredSave() {
  let resolve: () => void = () => {};
  let reject: (error: unknown) => void = () => {};
  const onSave = vi.fn(
    () =>
      new Promise<void>((res, rej) => {
        resolve = res;
        reject = rej;
      })
  );
  return { onSave, resolve: () => resolve(), reject: (error: unknown) => reject(error) };
}

function Harness({
  onSave,
  onClose,
  successMessage,
}: {
  onSave: () => Promise<void>;
  onClose: () => void;
  successMessage?: (data: { name: string }) => string;
}) {
  const [open, setOpen] = useState(true);
  return (
    <EditPanelWrapper
      open={open}
      onClose={() => {
        onClose();
        setOpen(false);
      }}
      title="Edit Person"
      initialData={{ name: 'Pat' }}
      schema={schema}
      onSave={onSave}
      {...(successMessage && { successMessage })}
    >
      <Fields />
    </EditPanelWrapper>
  );
}

function InlineHarness({ onSave, onClose }: { onSave: () => Promise<void>; onClose: () => void }) {
  const closeRequestRef = useRef<(() => void) | null>(null);
  const [open, setOpen] = useState(true);
  if (!open) return <p>Host list</p>;
  return (
    <div role="dialog" aria-label="Quick create">
      <button onClick={() => closeRequestRef.current?.()}>Back</button>
      <EditPanelWrapper
        variant="inline"
        open
        onClose={() => {
          onClose();
          setOpen(false);
        }}
        closeRequestRef={closeRequestRef}
        title="Edit Details"
        initialData={{ name: 'Pat' }}
        schema={schema}
        onSave={onSave}
      >
        <Fields />
      </EditPanelWrapper>
    </div>
  );
}

const stillSavingPrompt = () => screen.queryByRole('alertdialog', { name: /still saving/i });

async function startHangingSave(extra: { successMessage?: (d: { name: string }) => string } = {}) {
  const save = deferredSave();
  const onClose = vi.fn();
  const rendered = render(<Harness onSave={save.onSave} onClose={onClose} {...extra} />);
  await rendered.user.type(screen.getByLabelText('Name'), 'sy');
  await rendered.user.click(screen.getByRole('button', { name: /save changes/i }));
  await waitFor(() => expect(save.onSave).toHaveBeenCalledTimes(1));
  expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled();
  return { ...rendered, ...save, onClose };
}

async function leaveAnyway(user: Awaited<ReturnType<typeof startHangingSave>>['user']) {
  expect(await screen.findByRole('alertdialog', { name: /still saving/i })).toBeVisible();
  await user.click(screen.getByRole('button', { name: /leave anyway/i }));
}

describe('leaving an edit panel while its save is still in flight (MYK9-1125)', () => {
  beforeEach(() => {
    mocks.success.mockClear();
    mocks.error.mockClear();
  });

  it('Cancel asks, and Leave anyway closes the panel', async () => {
    const { user, onClose } = await startHangingSave();
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    await leaveAnyway(user);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog', { name: 'Edit Person' })).not.toBeInTheDocument();
  });

  it('Escape and the X reach the same prompt', async () => {
    const { user, onClose } = await startHangingSave();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(await screen.findByRole('alertdialog', { name: /still saving/i })).toBeVisible();
    await user.click(screen.getByRole('button', { name: /keep waiting/i }));
    await waitFor(() => expect(stillSavingPrompt()).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /close panel/i }));
    await leaveAnyway(user);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Keep waiting keeps the panel, and the save then finishes normally', async () => {
    const { user, onClose, resolve } = await startHangingSave({
      successMessage: d => `${d.name} saved`,
    });
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    await screen.findByRole('alertdialog', { name: /still saving/i });
    await user.click(screen.getByRole('button', { name: /keep waiting/i }));
    expect(onClose).not.toHaveBeenCalled();

    resolve();
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith('Patsy saved'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a save that completes after leaving is toasted, and does not close the host again', async () => {
    const { user, onClose, resolve } = await startHangingSave({
      successMessage: d => `${d.name} saved`,
    });
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    await leaveAnyway(user);

    resolve();
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith('Patsy saved'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it('a save with no success message still says it finished after leaving', async () => {
    const { user, resolve } = await startHangingSave();
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    await leaveAnyway(user);

    resolve();
    await waitFor(() => expect(mocks.success).toHaveBeenCalledTimes(1));
    expect(mocks.success.mock.calls[0]?.[0]).toMatch(/edit person/i);
  });

  it('a save that fails after leaving is toasted as not saved', async () => {
    const { user, reject } = await startHangingSave();
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    await leaveAnyway(user);

    reject(new TypeError('Failed to fetch'));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledTimes(1));
    const [title, options] = mocks.error.mock.calls[0] as [string, { description: string }];
    expect(title).toMatch(/not saved/i);
    expect(title).toMatch(/edit person/i);
    // The form is gone, so the usual "Your changes are still here" would be false.
    expect(options.description).not.toMatch(/still here/i);
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it('an inline host’s Back asks too, and Leave anyway returns to the host', async () => {
    const save = deferredSave();
    const onClose = vi.fn();
    const { user } = render(<InlineHarness onSave={save.onSave} onClose={onClose} />);
    await user.type(screen.getByLabelText('Name'), 'sy');
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(save.onSave).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: 'Back' }));
    await leaveAnyway(user);
    expect(await screen.findByText('Host list')).toBeInTheDocument();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a save that fails fast keeps the edits editable and the panel closable', async () => {
    const onClose = vi.fn();
    const onSave = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const { user } = render(<Harness onSave={onSave} onClose={onClose} />);
    await user.type(screen.getByLabelText('Name'), 'sy');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(mocks.error).toHaveBeenCalledTimes(1));
    const input = await screen.findByLabelText('Name');
    expect(input).toHaveValue('Patsy');
    expect(input).toBeEnabled();
    expect(screen.getByRole('button', { name: /save changes/i })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    // Not saving any more: the ordinary discard prompt, not the still-saving one.
    expect(await screen.findByRole('alertdialog', { name: /discard changes/i })).toBeVisible();
    expect(stillSavingPrompt()).not.toBeInTheDocument();
  });
});
