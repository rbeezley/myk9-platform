import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, userEvent, waitFor } from '@/test/utils/testUtils';
import { ReopenConflictButton } from './ReopenConflictButton';

const hoisted = vi.hoisted(() => ({
  reopen: vi.fn(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
  toastDismiss: vi.fn(),
  loggerWarn: vi.fn(),
}));

vi.mock('./reopenClassConflict', () => ({ reopenClassConflict: hoisted.reopen }));
vi.mock('sonner', () => ({
  toast: { error: hoisted.toastError, info: hoisted.toastInfo, dismiss: hoisted.toastDismiss },
}));
vi.mock('@/services/LoggingService', () => ({ logger: { warn: hoisted.loggerWarn } }));

describe('ReopenConflictButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('asks for the choice back for its class and stays quiet when it is raised', async () => {
    hoisted.reopen.mockResolvedValue(true);
    render(<ReopenConflictButton classId="class-1" />);
    await userEvent.click(screen.getByRole('button', { name: 'Show the choice again' }));
    await waitFor(() => expect(hoisted.reopen).toHaveBeenCalledWith('class-1'));
    expect(hoisted.toastError).not.toHaveBeenCalled();
    expect(hoisted.toastInfo).not.toHaveBeenCalled();
  });

  it('says so when the conflict could not be read', async () => {
    hoisted.reopen.mockRejectedValue(new Error('idb'));
    render(<ReopenConflictButton classId="class-1" />);
    await userEvent.click(screen.getByRole('button', { name: 'Show the choice again' }));
    await waitFor(() =>
      expect(hoisted.toastError).toHaveBeenCalledWith(
        "We couldn't bring the choice back. Try again."
      )
    );
    expect(hoisted.loggerWarn).toHaveBeenCalled();
  });

  it('says the class is settled when no conflict is left for it', async () => {
    hoisted.reopen.mockResolvedValue(false);
    render(<ReopenConflictButton classId="class-1" />);
    await userEvent.click(screen.getByRole('button', { name: 'Show the choice again' }));
    await waitFor(() =>
      expect(hoisted.toastInfo).toHaveBeenCalledWith(
        'This class is already settled. The check can show now.'
      )
    );
  });

  it('clears the open notice first so the reopened one re-enters visibly', async () => {
    const order: string[] = [];
    hoisted.toastDismiss.mockImplementation(() => order.push('dismiss'));
    hoisted.reopen.mockImplementation(async () => {
      order.push('reopen');
      return true;
    });
    render(<ReopenConflictButton classId="class-1" />);
    await userEvent.click(screen.getByRole('button', { name: 'Show the choice again' }));
    await waitFor(() => expect(order).toEqual(['dismiss', 'reopen']));
    expect(hoisted.toastDismiss).toHaveBeenCalledWith('conflict:classes:class-1');
  });

  it('is disabled while a reopen is in flight', async () => {
    let finish: (found: boolean) => void = () => {};
    hoisted.reopen.mockReturnValue(new Promise<boolean>(resolve => (finish = resolve)));
    render(<ReopenConflictButton classId="class-1" />);
    const button = screen.getByRole('button', { name: 'Show the choice again' });
    await userEvent.click(button);
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(hoisted.reopen).toHaveBeenCalledTimes(1);
    finish(true);
    await waitFor(() => expect(button).toBeEnabled());
  });
});
