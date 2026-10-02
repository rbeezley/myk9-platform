import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { render } from '@/test/utils/testUtils';
import { EditPanelWrapper } from '../EditPanelWrapper';
import { useEditPanel } from '../useEditPanel';
import { PanelSaveHandledError } from '../panelSaveErrors';
import { FriendlySaveError } from '@/utils/friendlySaveError';
import { logger } from '@/services/LoggingService';

const mocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('@/lib/notifications', () => ({
  notifications: { success: mocks.success, error: mocks.error, warning: vi.fn(), info: vi.fn() },
}));

vi.mock('@/services/LoggingService', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), debug: vi.fn(), info: vi.fn() },
}));

const schema = z.object({ name: z.string().min(1, 'Please enter a name') });

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

function renderPanel(
  onSave: (data: { name: string }) => Promise<void>,
  extra: Record<string, unknown> = {}
) {
  const onClose = vi.fn();
  render(
    <EditPanelWrapper
      open
      onClose={onClose}
      title="Test"
      initialData={{ name: 'Rex' }}
      schema={schema}
      onSave={onSave}
      variant="dialog"
      {...extra}
    >
      <Fields />
    </EditPanelWrapper>
  );
  return { onClose };
}

async function editAndSave(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Name'), 'y');
  await user.click(screen.getByRole('button', { name: /save changes/i }));
}

describe('EditPanelWrapper feedback', () => {
  beforeEach(() => {
    mocks.success.mockClear();
    mocks.error.mockClear();
    vi.mocked(logger.error).mockClear();
  });

  it('fires the saved toast from the wrapper after a successful save', async () => {
    const user = userEvent.setup();
    const { onClose } = renderPanel(vi.fn().mockResolvedValue(undefined), {
      successMessage: (data: { name: string }) => `${data.name} saved`,
    });
    await editAndSave(user);
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith('Rexy saved'));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows friendly copy, never the raw database text, and keeps the form open', async () => {
    const user = userEvent.setup();
    const raw = 'duplicate key value violates unique constraint "dogs_pkey"';
    const { onClose } = renderPanel(vi.fn().mockRejectedValue(new Error(raw)), {
      successMessage: 'Saved',
    });
    await editAndSave(user);
    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    const [title, options] = mocks.error.mock.calls[0];
    expect(`${title} ${options?.description}`).not.toContain('dogs_pkey');
    expect(`${title} ${options?.description}`).not.toContain('duplicate key');
    expect(options?.description).toContain('Your changes are still here. Try again.');
    expect(mocks.success).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Name')).toHaveValue('Rexy');
  });

  it('does not tell a refused user to try again', async () => {
    const user = userEvent.setup();
    renderPanel(vi.fn().mockRejectedValue({ code: '42501', message: 'permission denied' }));
    await editAndSave(user);
    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    const description = mocks.error.mock.calls[0][1]?.description as string;
    expect(description).toContain("You don't have permission");
    expect(description).not.toContain('Try again');
  });

  it('passes a deliberately friendly message through', async () => {
    const user = userEvent.setup();
    renderPanel(
      vi.fn().mockRejectedValue(new FriendlySaveError('That registration number is taken.'))
    );
    await editAndSave(user);
    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(mocks.error.mock.calls[0][1]?.description).toContain(
      'That registration number is taken.'
    );
  });

  it('stays quiet (no failure toast) when the panel already explained a handled refusal', async () => {
    const user = userEvent.setup();
    const { onClose } = renderPanel(vi.fn().mockRejectedValue(new PanelSaveHandledError()));
    await editAndSave(user);
    await waitFor(() => expect(screen.getByLabelText('Name')).toHaveValue('Rexy'));
    expect(mocks.error).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows an authored refusal as is, without "Try again"', async () => {
    const user = userEvent.setup();
    renderPanel(
      vi
        .fn()
        .mockRejectedValue(
          Object.assign(new Error('Entries for this show closed on Oct 1.'), { code: '22023' })
        )
    );
    await editAndSave(user);
    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    const description = mocks.error.mock.calls[0][1]?.description as string;
    expect(description).toContain('Entries for this show closed on Oct 1.');
    expect(description).not.toContain('Try again');
  });

  it('does not log a handled refusal as an error', async () => {
    const user = userEvent.setup();
    renderPanel(vi.fn().mockRejectedValue(new PanelSaveHandledError()));
    await editAndSave(user);
    await waitFor(() => expect(screen.getByLabelText('Name')).toHaveValue('Rexy'));
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('logs a real failure exactly once', async () => {
    const user = userEvent.setup();
    renderPanel(vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await editAndSave(user);
    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('says a save made offline was kept on this device and will sync', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const user = userEvent.setup();
    renderPanel(vi.fn().mockResolvedValue(undefined), {
      successMessage: (data: { name: string }) => `${data.name} saved`,
    });
    await editAndSave(user);
    await waitFor(() =>
      expect(mocks.success).toHaveBeenCalledWith(
        "Rexy saved on this device — it will sync when you're back online"
      )
    );
    vi.restoreAllMocks();
  });

  it('prompts before Cancel discards changes', async () => {
    const user = userEvent.setup();
    const { onClose } = renderPanel(vi.fn());
    await user.type(screen.getByLabelText('Name'), 'y');
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(await screen.findByText('Discard changes?')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
