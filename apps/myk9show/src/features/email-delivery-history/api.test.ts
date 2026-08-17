import { describe, expect, it, vi } from 'vitest';
import { fetchShowEmailDeliveryHistory, type EmailDeliverySupabaseClient } from './api';

function client(data: unknown): EmailDeliverySupabaseClient {
  return { rpc: vi.fn().mockResolvedValue({ data, error: null }) };
}

describe('fetchShowEmailDeliveryHistory', () => {
  it('uses the show scope and returns a stable cursor when the bounded page has more rows', async () => {
    const result = await fetchShowEmailDeliveryHistory({
      supabase: client([
        { id: 'attempt-1', attempted_at: '2026-08-17T12:00:00Z' },
        { id: 'attempt-2', attempted_at: '2026-08-17T11:00:00Z' },
        { id: 'attempt-3', attempted_at: '2026-08-17T10:00:00Z' },
      ]),
      showId: 'show-1',
      limit: 2,
    });

    expect(result.rows).toHaveLength(2);
    expect(result.nextCursor).toEqual({
      createdAt: '2026-08-17T11:00:00Z',
      id: 'attempt-2',
    });
  });

  it('passes both cursor fields together and surfaces RPC failures', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'forbidden' } });
    await expect(
      fetchShowEmailDeliveryHistory({
        supabase: { rpc },
        showId: 'show-2',
        cursor: { createdAt: '2026-08-17T10:00:00Z', id: 'attempt-9' },
      })
    ).rejects.toThrow('forbidden');
    expect(rpc).toHaveBeenCalledWith('get_show_email_delivery_history', {
      p_show_id: 'show-2',
      p_limit: 50,
      p_before_created_at: '2026-08-17T10:00:00Z',
      p_before_id: 'attempt-9',
    });
  });
});
