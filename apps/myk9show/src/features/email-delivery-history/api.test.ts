import { describe, expect, it, vi } from 'vitest';
import {
  fetchShowEmailContent,
  fetchShowEmailDeliveryHistory,
  type EmailDeliverySupabaseClient,
} from './api';

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

  it('narrows to one exhibitor with p_recipient_email, and leaves it out when unset', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    await fetchShowEmailDeliveryHistory({
      supabase: { rpc },
      showId: 'show-1',
      recipientEmail: 'jamie@example.com',
    });
    expect(rpc).toHaveBeenLastCalledWith('get_show_email_delivery_history', {
      p_show_id: 'show-1',
      p_limit: 50,
      p_before_created_at: null,
      p_before_id: null,
      p_recipient_email: 'jamie@example.com',
    });

    await fetchShowEmailDeliveryHistory({ supabase: { rpc }, showId: 'show-1' });
    expect(rpc.mock.lastCall?.[1]).not.toHaveProperty('p_recipient_email');
  });
});

describe('fetchShowEmailContent', () => {
  it('asks the RPC for one email_log row and returns its copy', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: [{ subject: 'S', html: '<p>h</p>' }], error: null });
    const result = await fetchShowEmailContent({ supabase: { rpc }, emailLogId: 'log-1' });
    expect(rpc).toHaveBeenCalledWith('get_show_email_content', { p_email_log_id: 'log-1' });
    expect(result).toEqual({ subject: 'S', html: '<p>h</p>' });
  });

  it('returns null when no copy was kept and throws on an RPC error', async () => {
    expect(await fetchShowEmailContent({ supabase: client([]), emailLogId: 'log-1' })).toBeNull();
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'forbidden' } });
    await expect(fetchShowEmailContent({ supabase: { rpc }, emailLogId: 'x' })).rejects.toThrow(
      'forbidden'
    );
  });
});
