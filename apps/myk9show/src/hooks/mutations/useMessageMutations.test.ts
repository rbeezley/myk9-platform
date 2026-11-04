import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useMessageMutations } from './useMessageMutations';

const mockInvoke = vi.hoisted(() => vi.fn());
const mockWarning = vi.hoisted(() => vi.fn());
const mockSuccess = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase-client', () => ({ supabase: { functions: { invoke: mockInvoke } } }));
vi.mock('@/lib/notifications', () => ({
  notifications: { warning: mockWarning, success: mockSuccess, error: vi.fn() },
}));

describe('sendTargetedMessage email history note', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('warns that the send may not show in Email delivery history', async () => {
    mockInvoke.mockResolvedValue({
      data: {
        total_recipients: 4,
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
});
