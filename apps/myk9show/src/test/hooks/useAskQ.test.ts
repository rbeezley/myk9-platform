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
      { event: 'tools_used', data: ['search_rules'] },
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
    expect(result.current.toolsUsed).toEqual(['search_rules']);
    expect(result.current.remaining).toBe(9);
    expect(result.current.status).toBe('done');
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
});
