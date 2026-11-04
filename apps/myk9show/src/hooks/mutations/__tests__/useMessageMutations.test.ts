import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMessageMutations } from '../useMessageMutations';

vi.mock('@/store/messageStore', () => ({
  useMessageStore: Object.assign(
    vi.fn(selector => {
      const state = {
        sendMessage: vi.fn().mockResolvedValue(undefined),
        markThreadRead: vi.fn(),
        getOrCreateThread: vi.fn().mockResolvedValue('thread-1'),
      };
      return selector ? selector(state) : state;
    }),
    {
      getState: vi.fn().mockReturnValue({
        sendMessage: vi.fn(),
        markThreadRead: vi.fn(),
        getOrCreateThread: vi.fn().mockResolvedValue('thread-1'),
      }),
    }
  ),
}));

vi.mock('@/lib/supabase-client', () => ({
  supabase: {
    functions: {
      invoke: vi
        .fn()
        .mockResolvedValue({ data: { inbox_sent: 5, people_reached: 5 }, error: null }),
    },
  },
}));

vi.mock('@/lib/notifications', () => ({
  notifications: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('useMessageMutations', () => {
  it('sends a message via store', async () => {
    const { result } = renderHook(() => useMessageMutations());

    await act(async () => {
      await result.current.sendMessage('thread-1', 'show-1', 'Hello secretary');
    });

    expect(result.current.isSending).toBe(false);
  });

  it('sends a targeted message via edge function', async () => {
    const { supabase } = await import('@/lib/supabase-client');
    const { result } = renderHook(() => useMessageMutations());

    await act(async () => {
      await result.current.sendTargetedMessage(
        'show-1',
        { type: 'class', classId: 'class-1' },
        'Class 4 is delayed'
      );
    });

    expect(supabase.functions.invoke).toHaveBeenCalledWith('send-targeted-message', {
      body: {
        show_id: 'show-1',
        target_type: 'class',
        class_id: 'class-1',
        send_push: false,
        body: 'Class 4 is delayed',
      },
    });
  });

  it('sends the one-person scope with exactly that person id and email on', async () => {
    const { supabase } = await import('@/lib/supabase-client');
    const { result } = renderHook(() => useMessageMutations());

    await act(async () => {
      await result.current.sendTargetedMessage(
        'show-1',
        { type: 'person', personId: 'person-9', sendPush: true, sendEmail: true },
        'Bring your vet papers'
      );
    });

    expect(supabase.functions.invoke).toHaveBeenLastCalledWith('send-targeted-message', {
      body: {
        show_id: 'show-1',
        target_type: 'person',
        person_id: 'person-9',
        send_push: true,
        send_email: true,
        body: 'Bring your vet papers',
      },
    });
  });

  it('passes targeted push intent to the edge function', async () => {
    const { supabase } = await import('@/lib/supabase-client');
    const { result } = renderHook(() => useMessageMutations());

    await act(async () => {
      await result.current.sendTargetedMessage(
        'show-1',
        { type: 'class', classId: 'class-1', sendPush: true },
        'Class 4 is delayed'
      );
    });

    expect(supabase.functions.invoke).toHaveBeenCalledWith('send-targeted-message', {
      body: {
        show_id: 'show-1',
        target_type: 'class',
        class_id: 'class-1',
        send_push: true,
        body: 'Class 4 is delayed',
      },
    });
  });

  it('does not treat targeted messages with no recipients as success', async () => {
    const { supabase } = await import('@/lib/supabase-client');
    const { notifications } = await import('@/lib/notifications');
    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
      data: { inbox_sent: 0, push_sent: 0, people_reached: 0 },
      error: null,
    });
    const { result } = renderHook(() => useMessageMutations());

    let sendResult: unknown;
    await act(async () => {
      sendResult = await result.current.sendTargetedMessage(
        'show-1',
        { type: 'checked_in' },
        'Gate is moving now'
      );
    });

    expect(sendResult).toMatchObject({ inboxSent: 0, pushSent: 0, peopleReached: 0 });
    expect(notifications.error).toHaveBeenCalledWith(
      expect.stringContaining('No one was reached.'),
      expect.anything()
    );
    expect(notifications.success).not.toHaveBeenCalled();
  });
});
