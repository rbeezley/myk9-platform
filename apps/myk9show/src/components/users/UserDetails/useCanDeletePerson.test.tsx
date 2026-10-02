import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UserRole } from '@/types/auth-types';
import { useCanDeletePerson } from './useCanDeletePerson';

const preview = vi.hoisted(() => vi.fn());
vi.mock('@/features/delete/deletePreview', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/delete/deletePreview')>()),
  fetchDeletePreview: preview,
}));

const NOTHING = {
  trials: 0,
  classes: 0,
  entries: 0,
  shows: 0,
  dogs: 0,
  paid: 0,
  scored: 0,
  blocking: 0,
};
const person = { id: 'p1', user_id: 'auth-1' };

function run(roles: UserRole[], authId: string, isRemoved = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useCanDeletePerson(person, { id: authId, roles }, isRemoved), {
    wrapper,
  });
}

describe('useCanDeletePerson', () => {
  beforeEach(() => {
    preview.mockReset().mockResolvedValue(NOTHING);
  });

  it('lets a site admin and the person themselves delete without asking the server', () => {
    expect(run([UserRole.SITE_ADMIN], 'auth-9').result.current).toBe(true);
    expect(run([UserRole.EXHIBITOR], 'auth-1').result.current).toBe(true);
    expect(preview).not.toHaveBeenCalled();
  });

  it('shows Delete to staff only once the server answers, for a person in their shows', async () => {
    const { result } = run([UserRole.SECRETARY], 'auth-9');
    expect(result.current).toBe(false);
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('hides Delete from staff for a person outside their shows (server refuses)', async () => {
    preview.mockRejectedValue({ code: '42501', message: 'Permission denied' });
    const { result } = run([UserRole.CLUB_ADMIN], 'auth-9');
    await waitFor(() => expect(preview).toHaveBeenCalled());
    expect(result.current).toBe(false);
  });

  it('never asks and never shows for an exhibitor looking at someone else', () => {
    const { result } = run([UserRole.EXHIBITOR], 'auth-9');
    expect(result.current).toBe(false);
    expect(preview).not.toHaveBeenCalled();
  });

  it('never shows for a removed person', () => {
    expect(run([UserRole.SITE_ADMIN], 'auth-9', true).result.current).toBe(false);
  });
});
