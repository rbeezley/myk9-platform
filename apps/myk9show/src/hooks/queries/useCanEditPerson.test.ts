import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCanEditPerson } from './useCanEditPerson';

const rpc = vi.fn();
vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client }, children);
}

// MYK9-1134: the same decision as useCanEditDog (canEditFromCheck), asked of
// can_edit_person, the function people_update and update_person_details share.
describe('useCanEditPerson', () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it('does not ask when the caller already knows (own record, site admin, made here)', () => {
    const { result } = renderHook(() => useCanEditPerson('person-1', true), { wrapper });
    expect(result.current).toBe(true);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('withholds editing once the server answers no', async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    const { result } = renderHook(() => useCanEditPerson('person-1', false), { wrapper });
    await waitFor(() => expect(result.current).toBe(false));
    expect(rpc).toHaveBeenCalledWith('can_edit_person', { p_person_id: 'person-1' });
  });

  it('allows editing when the server answers yes', async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    const { result } = renderHook(() => useCanEditPerson('person-1', false), { wrapper });
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(result.current).toBe(true);
  });

  it('fails open when the server has no such person yet (made on this device)', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const { result } = renderHook(() => useCanEditPerson('person-1', false), { wrapper });
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(result.current).toBe(true);
  });

  it('fails open when the first check fails', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'JWT expired' } });
    const { result } = renderHook(() => useCanEditPerson('person-1', false), { wrapper });
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(result.current).toBe(true);
  });
});
