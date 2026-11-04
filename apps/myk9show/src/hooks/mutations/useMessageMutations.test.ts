import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useMessageMutations } from './useMessageMutations';

const mockInvoke = vi.hoisted(() => vi.fn());
const mockWarning = vi.hoisted(() => vi.fn());
const mockSuccess = vi.hoisted(() => vi.fn());
const mockError = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase-client', () => ({ supabase: { functions: { invoke: mockInvoke } } }));
vi.mock('@/lib/notifications', () => ({
  notifications: { warning: mockWarning, success: mockSuccess, error: mockError },
}));

describe('sendTargetedMessage email history note', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('warns that the send may not show in Email delivery history', async () => {
    mockInvoke.mockResolvedValue({
      data: {
        inbox_sent: 4,
        people_reached: 4,
        email_recipients: 4,
        email_sent: 4,
        email_failed: 0,
        email_missing: [],
        email_log_failed: true,
      },
      error: null,
    });
    const { result } = renderHook(() => useMessageMutations());

    await act(async () => {
      await result.current.sendTargetedMessage(
        'show-1',
        { type: 'all_show', sendEmail: true },
        'Hello'
      );
    });

    expect(mockWarning).toHaveBeenCalledWith(
      expect.stringContaining('Sent, but it may not show in Email delivery history.'),
      expect.anything()
    );
    expect(mockSuccess).not.toHaveBeenCalled();
  });

  it('names people with no usable address when nobody could be reached', async () => {
    mockInvoke.mockResolvedValue({
      data: {
        email_recipients: 0,
        email_sent: 0,
        email_failed: 0,
        email_missing: ['Una Smith'],
      },
      error: null,
    });
    const { result } = renderHook(() => useMessageMutations());

    let sendResult: unknown;
    await act(async () => {
      sendResult = await result.current.sendTargetedMessage(
        'show-1',
        { type: 'class', classId: 'c1', sendEmail: true },
        'Hello'
      );
    });

    expect(sendResult).toMatchObject({ peopleReached: 0, email: { missing: ['Una Smith'] } });
    expect(mockError).toHaveBeenCalledWith(
      expect.stringContaining('No one was reached. No usable email address'),
      expect.anything()
    );
    expect(mockSuccess).not.toHaveBeenCalled();
  });
});
