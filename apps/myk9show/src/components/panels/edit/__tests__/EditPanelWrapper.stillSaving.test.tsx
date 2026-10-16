/**
 * MYK9-1125: a panel holds still while its save is in flight (the save may
 * still fail back to the form), but it must never ignore the person silently.
 * Cancel, Escape, the X and an inline host's Back explain "Still saving"; Keep
 * waiting is the only answer, and the dialog closes itself once the save
 * settles. A save that fails fast keeps the edits and the panel closable.
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

/** A save the test settles by hand; until then it hangs like a stalled request. */
function deferredSave() {
  let resolve: () => void = () => {};
  const onSave = vi.fn(() => new Promise<void>(res => (resolve = res)));
  return { onSave, resolve: () => resolve() };
}

function Harness({ onSave, onClose }: { onSave: () => Promise<void>; onClose: () => void }) {
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
    >
      <Fields />
    </EditPanelWrapper>
  );
}

function InlineHarness({ onSave }: { onSave: () => Promise<void> }) {
  const closeRequestRef = useRef<(() => void) | null>(null);
  return (
    <div>
      <button onClick={() => closeRequestRef.current?.()}>Back</button>
      <EditPanelWrapper
        variant="inline"
        open
        onClose={vi.fn()}
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

const stillSaving = () => screen.queryByRole('alertdialog', { name: /still saving/i });
const panel = () => screen.queryByRole('dialog', { name: 'Edit Person' });

async function startHangingSave() {
  const save = deferredSave();
  const onClose = vi.fn();
  const rendered = render(<Harness onSave={save.onSave} onClose={onClose} />);
  await rendered.user.type(screen.getByLabelText('Name'), 'sy');
  await rendered.user.click(screen.getByRole('button', { name: /save changes/i }));
  await waitFor(() => expect(save.onSave).toHaveBeenCalledTimes(1));
  expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled();
  return { ...rendered, ...save, onClose };
}

async function keepWaiting(user: Awaited<ReturnType<typeof startHangingSave>>['user']) {
  const dialog = await screen.findByRole('alertdialog', { name: /still saving/i });
  expect(dialog).toHaveTextContent(/waiting for the server to answer/i);
  // Keep waiting is the only answer: there is no way to leave mid-save.
  expect(screen.queryByRole('button', { name: /leave/i })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /keep waiting/i }));
  await waitFor(() => expect(stillSaving()).not.toBeInTheDocument());
}

describe('closing a panel while its save is in flight (MYK9-1125)', () => {
  beforeEach(() => {
    mocks.success.mockClear();
    mocks.error.mockClear();
  });

  it('Cancel explains "Still saving"; Keep waiting leaves the panel and the save as they were', async () => {
    const { user, onClose } = await startHangingSave();
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    await keepWaiting(user);
    expect(onClose).not.toHaveBeenCalled();
    expect(panel()).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled();
  });

  it('Escape and the X explain it too', async () => {
    const { user, onClose } = await startHangingSave();
    fireEvent.keyDown(document, { key: 'Escape' });
    await keepWaiting(user);
    await user.click(screen.getByRole('button', { name: /close panel/i }));
    await keepWaiting(user);
    expect(onClose).not.toHaveBeenCalled();
    expect(panel()).toBeInTheDocument();
  });

  it('an inline host’s Back explains it too', async () => {
    const save = deferredSave();
    const { user } = render(<InlineHarness onSave={save.onSave} />);
    await user.type(screen.getByLabelText('Name'), 'sy');
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(save.onSave).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('alertdialog', { name: /still saving/i })).toBeVisible();
  });

  it('the dialog closes itself when the save settles, and the panel closes as usual', async () => {
    const { user, onClose, resolve } = await startHangingSave();
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    await screen.findByRole('alertdialog', { name: /still saving/i });

    resolve();
    await waitFor(() => expect(stillSaving()).not.toBeInTheDocument());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a failure closes the dialog, and the next save does not bring it back', async () => {
    let reject: (error: unknown) => void = () => {};
    const onSave = vi
      .fn()
      .mockImplementationOnce(() => new Promise<void>((_res, rej) => (reject = rej)))
      .mockImplementation(() => new Promise<void>(() => {}));
    const { user } = render(<Harness onSave={onSave} onClose={vi.fn()} />);
    await user.type(screen.getByLabelText('Name'), 'sy');
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    await screen.findByRole('alertdialog', { name: /still saving/i });

    reject(new TypeError('Failed to fetch'));
    await waitFor(() => expect(stillSaving()).not.toBeInTheDocument());
    expect(mocks.error).toHaveBeenCalledTimes(1);
    expect(await screen.findByLabelText('Name')).toHaveValue('Patsy');

    await user.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect(stillSaving()).not.toBeInTheDocument();
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
    expect(await screen.findByRole('alertdialog', { name: /discard changes/i })).toBeVisible();
    expect(stillSaving()).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /discard changes/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
