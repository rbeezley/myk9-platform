import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMessageEmailAudience } from '../useMessageEmailAudience';
import { supabase } from '@/lib/supabase-client';

vi.mock('@/lib/supabase-client', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useMessageEmailAudience', () => {
  beforeEach(() => {
    vi.mocked(supabase.functions.invoke).mockReset();
  });

  it('previews with dry_run and no body, so an older function 400s instead of broadcasting', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { dry_run: true, email_recipients: 3, email_missing: [] },
      error: null,
    });
    const { result } = renderHook(
      () => useMessageEmailAudience('show-1', { type: 'class', classId: 'c1' }, true),
      { wrapper }
    );

    await waitFor(() => expect(result.current.data).toBeDefined());
    const payload = vi.mocked(supabase.functions.invoke).mock.calls[0][1] as {
      body: Record<string, unknown>;
    };
    expect(payload.body).toEqual({
      show_id: 'show-1',
      target_type: 'class',
      class_id: 'c1',
      send_email: true,
      dry_run: true,
    });
    expect(payload.body).not.toHaveProperty('body');
  });

  it('does not retry a failed preview', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: null,
      error: new Error('400'),
    });
    const { result } = renderHook(
      () => useMessageEmailAudience('show-1', { type: 'all_show' }, true),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(supabase.functions.invoke).toHaveBeenCalledTimes(1);
  });
});
