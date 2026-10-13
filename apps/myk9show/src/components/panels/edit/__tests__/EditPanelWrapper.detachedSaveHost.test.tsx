/**
 * MYK9-1125 (Codex review of fa4358531): once the person chose "Leave anyway",
 * the save's late completion must not act on the host. A host's onSave runs its
 * own navigation and callbacks BEFORE it returns, so the wrapper cannot catch
 * that afterwards: the save context tells the host whether it is still current,
 * and its self-navigation stands down by itself once it is not.
 */
import { useState } from 'react';
import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { render } from '@/test/utils/testUtils';
import { EditPanelWrapper, type EditPanelSaveContext } from '../EditPanelWrapper';
import { useEditPanel } from '../useEditPanel';

const mocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('@/lib/notifications', () => ({
  notifications: { success: mocks.success, error: mocks.error, warning: vi.fn(), info: vi.fn() },
}));
vi.mock('@/services/LoggingService', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), debug: vi.fn(), info: vi.fn() },
}));

const schema = z.object({ name: z.string().min(1) });
type Form = { name: string };

function Fields() {
  const { form } = useEditPanel<Form>();
  if (!form) return null;
  return (
    <input
      aria-label="Name"
      value={form.data.name}
      onChange={e => form.setValue('name', e.target.value)}
    />
  );
}

function Host({
  onSave,
}: {
  onSave: (data: Form, context: EditPanelSaveContext) => Promise<void>;
}) {
  const [open, setOpen] = useState(true);
  return (
    <EditPanelWrapper
      open={open}
      onClose={() => setOpen(false)}
      title="Add Dog"
      initialData={{ name: 'Rex' }}
      schema={schema}
      onSave={onSave}
    >
      <Fields />
    </EditPanelWrapper>
  );
}

function lateSave() {
  let resolve: () => void = () => {};
  const persisted = new Promise<void>(res => (resolve = res));
  return { persisted, resolve: () => resolve() };
}

async function saveThenLeave(onSave: (data: Form, context: EditPanelSaveContext) => Promise<void>) {
  const { user } = render(<Host onSave={onSave} />);
  await user.type(screen.getByLabelText('Name'), 'y');
  await user.click(screen.getByRole('button', { name: /save changes/i }));
  await user.click(screen.getByRole('button', { name: /^cancel$/i }));
  await screen.findByRole('alertdialog', { name: /still saving/i });
  await user.click(screen.getByRole('button', { name: /leave anyway/i }));
  return { user };
}

describe('a save the person left does not act on its host (MYK9-1125)', () => {
  beforeEach(() => {
    mocks.success.mockClear();
    mocks.error.mockClear();
  });

  it('the host’s post-save navigation does not run once the person has left', async () => {
    const save = lateSave();
    const onCreated = vi.fn();
    await saveThenLeave(async (data, { runSelfNavigation }) => {
      await save.persisted;
      runSelfNavigation(() => onCreated(data));
    });

    save.resolve();
    await waitFor(() => expect(mocks.success).toHaveBeenCalledTimes(1));
    expect(onCreated).not.toHaveBeenCalled();
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it('isCurrent() is false after Leave anyway, so plain host callbacks can stand down', async () => {
    const save = lateSave();
    const seen: boolean[] = [];
    await saveThenLeave(async (_data, { isCurrent }) => {
      await save.persisted;
      seen.push(isCurrent());
    });

    save.resolve();
    await waitFor(() => expect(mocks.success).toHaveBeenCalledTimes(1));
    expect(seen).toEqual([false]);
  });

  it('a save the person waited for is current, and its navigation runs', async () => {
    const onCreated = vi.fn();
    const seen: boolean[] = [];
    const { user } = render(
      <Host
        onSave={async (data, { runSelfNavigation, isCurrent }) => {
          seen.push(isCurrent());
          runSelfNavigation(() => onCreated(data));
        }}
      />
    );
    await user.type(screen.getByLabelText('Name'), 'y');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith({ name: 'Rexy' }));
    expect(seen).toEqual([true]);
  });
});
