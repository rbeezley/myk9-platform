import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { useIsGuestLanding } from '../useIsGuestLanding';

const auth = vi.hoisted(() => ({ user: null as null | { id: string } }));
vi.mock('@/hooks/useAuthContext', () => ({ useAuthContext: () => auth }));

const at = (path: string) => ({
  wrapper: ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>
  ),
});

describe('useIsGuestLanding', () => {
  it('is true only for a guest on the root path', () => {
    auth.user = null;
    expect(renderHook(useIsGuestLanding, at('/')).result.current).toBe(true);
    expect(renderHook(useIsGuestLanding, at('/shows')).result.current).toBe(false);
  });

  it('is false for a signed-in user on the root path (onboarding return)', () => {
    auth.user = { id: 'u1' };
    expect(renderHook(useIsGuestLanding, at('/?onboarding=true')).result.current).toBe(false);
  });
});
