import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMessageShowClassOptions } from '../useMessageShowClassOptions';
import { supabase } from '@/lib/supabase-client';

vi.mock('@/lib/supabase-client', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useMessageShowClassOptions', () => {
  it('does not query classes when disabled', () => {
    renderHook(() => useMessageShowClassOptions('show-1', { enabled: false }), {
      wrapper,
    });

    expect(supabase.from).not.toHaveBeenCalled();
  });
});
