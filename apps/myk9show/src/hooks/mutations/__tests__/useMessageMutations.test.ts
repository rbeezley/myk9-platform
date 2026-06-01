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
      invoke: vi.fn().mockResolvedValue({ data: { sent_to: 5 }, error: null }),
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
});
