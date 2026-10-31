import { renderHook, act } from '@testing-library/react';
import { useAskQ } from '@/hooks/useAskQ';
import * as askqService from '@/services/askqService';

vi.mock('@/services/askqService', async importOriginal => {
  const actual = await importOriginal<typeof askqService>();
  return { ...actual, sendAskQQuery: vi.fn() };
});

function createMockStream(
  events: Array<{ event: string; data: unknown }>
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const sseText = events
    .map(e => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`)
    .join('');
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(sseText));
      controller.close();
    },
  });
}

describe('useAskQ', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('starts in idle state', () => {
    const { result } = renderHook(() => useAskQ());
    expect(result.current.status).toBe('idle');
    expect(result.current.answer).toBe('');
    expect(result.current.toolsUsed).toEqual([]);
    expect(result.current.sources).toEqual({});
    expect(result.current.error).toBeNull();
  });

  it('streams an answer from the service', async () => {
    const mockStream = createMockStream([
      { event: 'tools_used', data: ['get_class_summary'] },
      { event: 'token', data: 'Hello' },
      { event: 'token', data: ' world' },
      { event: 'meta', data: { remaining: 9, limit: 10, responseTimeMs: 500 } },
      { event: 'done', data: {} },
    ]);
    vi.mocked(askqService.sendAskQQuery).mockResolvedValue(mockStream);

    const { result } = renderHook(() => useAskQ());
    await act(async () => {
      await result.current.submitQuery('test question');
    });

    expect(result.current.answer).toBe('Hello world');
    expect(result.current.toolsUsed).toEqual(['get_class_summary']);
    expect(result.current.remaining).toBe(9);
    expect(result.current.status).toBe('done');
  });

  it('sends selected question mode and rulebook scope to the service', async () => {
    const mockStream = createMockStream([{ event: 'done', data: {} }]);
    vi.mocked(askqService.sendAskQQuery).mockResolvedValue(mockStream);

    const { result } = renderHook(() => useAskQ());
    await act(async () => {
      await result.current.submitQuery('What is max time?', {
        questionMode: 'rules',
        rulebookScope: { organizationCode: 'AKC', sportCode: 'akc-scent-work' },
      });
    });

    expect(askqService.sendAskQQuery).toHaveBeenCalledWith(
      {
        message: 'What is max time?',
        questionMode: 'rules',
        rulebookScope: { organizationCode: 'AKC', sportCode: 'akc-scent-work' },
      },
      expect.any(AbortSignal)
    );
  });

  it('keeps omitted mode backward compatible', async () => {
    const mockStream = createMockStream([{ event: 'done', data: {} }]);
    vi.mocked(askqService.sendAskQQuery).mockResolvedValue(mockStream);

    const { result } = renderHook(() => useAskQ());
    await act(async () => {
      await result.current.submitQuery('test question');
    });

    expect(askqService.sendAskQQuery).toHaveBeenCalledWith(
      { message: 'test question' },
      expect.any(AbortSignal)
    );
  });

  it('handles rate limit errors', async () => {
    vi.mocked(askqService.sendAskQQuery).mockRejectedValue(
      new askqService.RateLimitError(0, 10, '2026-04-02T00:00:00Z')
    );

    const { result } = renderHook(() => useAskQ());
    await act(async () => {
      await result.current.submitQuery('test');
    });

    expect(result.current.status).toBe('rate-limited');
    expect(result.current.remaining).toBe(0);
  });

  it('handles generic errors', async () => {
    vi.mocked(askqService.sendAskQQuery).mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useAskQ());
    await act(async () => {
      await result.current.submitQuery('test');
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('Network error');
  });

  it('resets state on new query', async () => {
    const mockStream = createMockStream([
      { event: 'token', data: 'First answer' },
      { event: 'meta', data: { remaining: 8, limit: 10, responseTimeMs: 200 } },
      { event: 'done', data: {} },
    ]);
    vi.mocked(askqService.sendAskQQuery).mockResolvedValue(mockStream);

    const { result } = renderHook(() => useAskQ());
    await act(async () => {
      await result.current.submitQuery('first');
    });
    expect(result.current.answer).toBe('First answer');

    const mockStream2 = createMockStream([
      { event: 'token', data: 'Second' },
      { event: 'meta', data: { remaining: 7, limit: 10, responseTimeMs: 300 } },
      { event: 'done', data: {} },
    ]);
    vi.mocked(askqService.sendAskQQuery).mockResolvedValue(mockStream2);

    await act(async () => {
      await result.current.submitQuery('second');
    });
    expect(result.current.answer).toBe('Second');
  });

  describe('persisted thread', () => {
    const doneStream = (text: string) =>
      createMockStream([
        { event: 'token', data: text },
        {
          event: 'meta',
          data: { remaining: 9, limit: 10, responseTimeMs: 1, queryLogId: 'log-1' },
        },
        { event: 'done', data: {} },
      ]);

    beforeEach(() => {
      window.localStorage.clear();
    });

    it('appends answers, survives remount, and isolates users', async () => {
      vi.mocked(askqService.sendAskQQuery).mockImplementation(async () => doneStream('A'));
      const opts = { userId: 'u1', scope: 'show-1' };
      const first = renderHook(() => useAskQ(undefined, opts));
      await act(async () => {
        await first.result.current.submitQuery('one');
      });
      await act(async () => {
        await first.result.current.submitQuery('two');
      });
      expect(first.result.current.thread.map(e => e.question)).toEqual(['one', 'two']);
      expect(first.result.current.thread[0]?.queryLogId).toBe('log-1');
      first.unmount();

      const again = renderHook(() => useAskQ(undefined, opts));
      expect(again.result.current.thread.map(e => e.question)).toEqual(['one', 'two']);

      const other = renderHook(() => useAskQ(undefined, { userId: 'u2', scope: 'show-1' }));
      expect(other.result.current.thread).toEqual([]);
    });

    it('newQuestion keeps history; clearHistory removes it', async () => {
      vi.mocked(askqService.sendAskQQuery).mockImplementation(async () => doneStream('A'));
      const { result } = renderHook(() => useAskQ(undefined, { userId: 'u1', scope: 'app' }));
      await act(async () => {
        await result.current.submitQuery('one');
      });
      act(() => result.current.newQuestion());
      expect(result.current.thread).toHaveLength(1);
      expect(result.current.status).toBe('idle');
      act(() => result.current.clearHistory());
      expect(result.current.thread).toEqual([]);
      expect(window.localStorage.length).toBe(0);
    });

    it('keeps the thread in memory only until the user id resolves', async () => {
      vi.mocked(askqService.sendAskQQuery).mockImplementation(async () => doneStream('A'));
      const { result } = renderHook(() => useAskQ(undefined, { userId: null, scope: 'app' }));
      await act(async () => {
        await result.current.submitQuery('one');
      });
      expect(result.current.thread).toHaveLength(1);
      expect(window.localStorage.length).toBe(0);
    });

    it('still works with storage blocked', async () => {
      vi.mocked(askqService.sendAskQQuery).mockImplementation(async () => doneStream('A'));
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('blocked');
      });
      const { result } = renderHook(() => useAskQ(undefined, { userId: 'u1', scope: 'app' }));
      await act(async () => {
        await result.current.submitQuery('one');
      });
      expect(result.current.thread).toHaveLength(1);
    });

    it('drops an in-flight answer when the show changes and stores only displayed source fields', async () => {
      let release!: () => void;
      const gate = new Promise<void>(r => (release = r));
      vi.mocked(askqService.sendAskQQuery).mockImplementation(async () => {
        await gate;
        return createMockStream([
          { event: 'token', data: 'A' },
          { event: 'done', data: {} },
        ]);
      });
      const { result, rerender } = renderHook(
        ({ scope }) => useAskQ(undefined, { userId: 'u1', scope }),
        { initialProps: { scope: 'show-1' } }
      );
      let pending!: Promise<void>;
      act(() => {
        pending = result.current.submitQuery('one');
      });
      rerender({ scope: 'show-2' });
      await act(async () => {
        release();
        await pending;
      });
      expect(result.current.thread).toEqual([]);
      expect(window.localStorage.length).toBe(0);
    });

    it('persists only the source fields the panel renders', async () => {
      vi.mocked(askqService.sendAskQQuery).mockImplementation(async () =>
        createMockStream([
          {
            event: 'sources',
            data: { entries: [{ call_name: 'Rex', handler_name: 'Pat', fault: 'x' }] },
          },
          { event: 'token', data: 'A' },
          { event: 'done', data: {} },
        ])
      );
      const { result } = renderHook(() => useAskQ(undefined, { userId: 'u1', scope: 'app' }));
      await act(async () => {
        await result.current.submitQuery('one');
      });
      expect(result.current.thread[0]?.sources).toEqual({ entries: [{ call_name: 'Rex' }] });
    });

    it('keeps the rate-limited status through New question and Clear history', async () => {
      vi.mocked(askqService.sendAskQQuery).mockRejectedValue(
        new askqService.RateLimitError(0, 10, '2026-11-01T00:00:00Z')
      );
      const { result } = renderHook(() => useAskQ(undefined, { userId: 'u1', scope: 'app' }));
      await act(async () => {
        await result.current.submitQuery('one');
      });
      expect(result.current.status).toBe('rate-limited');
      act(() => result.current.newQuestion());
      expect(result.current.status).toBe('rate-limited');
      act(() => result.current.clearHistory());
      expect(result.current.status).toBe('rate-limited');
      expect(result.current.remaining).toBe(0);
    });
  });
});
