import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

describe('useSupabase', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('should throw when Supabase is not initialized', async () => {
    const { useSupabase } = await import('./useSupabase');
    expect(() => renderHook(() => useSupabase())).toThrow(
      'Supabase client not initialized'
    );
  });

  it('should return the client when initialized', async () => {
    const { initSupabase } = await import('../client');
    initSupabase({
      url: 'https://test.supabase.co',
      anonKey: 'test-key',
    });

    const { useSupabase } = await import('./useSupabase');
    const { result } = renderHook(() => useSupabase());
    expect(result.current).toBeDefined();
    expect(typeof result.current.from).toBe('function');
  });
});
