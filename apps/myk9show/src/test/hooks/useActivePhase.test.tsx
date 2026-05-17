import { act, renderHook } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { useActivePhase } from '@/hooks/useActivePhase';

function createWrapper(initialEntry = '/') {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={[initialEntry]}>{children}</MemoryRouter>;
  };
}

function usePhaseWithPath() {
  const [phase, setPhase] = useActivePhase();
  const location = useLocation();
  return { phase, setPhase, search: location.search };
}

describe('useActivePhase', () => {
  it('returns setup when no phase is present', () => {
    const { result } = renderHook(() => useActivePhase(), {
      wrapper: createWrapper('/secretary/shows/show-1'),
    });

    expect(result.current[0]).toBe('setup');
  });

  it('reads a valid phase from the URL', () => {
    const { result } = renderHook(() => useActivePhase(), {
      wrapper: createWrapper('/secretary/shows/show-1?phase=today'),
    });

    expect(result.current[0]).toBe('today');
  });

  it('falls back to setup for an invalid phase', () => {
    const { result } = renderHook(() => useActivePhase(), {
      wrapper: createWrapper('/secretary/shows/show-1?phase=dashboard'),
    });

    expect(result.current[0]).toBe('setup');
  });

  it('updates the phase while preserving unrelated query params', () => {
    const { result } = renderHook(() => usePhaseWithPath(), {
      wrapper: createWrapper('/secretary/shows/show-1?focus=check-in&phase=setup'),
    });

    act(() => {
      result.current.setPhase('wrap-up');
    });

    expect(result.current.phase).toBe('wrap-up');
    expect(result.current.search).toContain('focus=check-in');
    expect(result.current.search).toContain('phase=wrap-up');
  });

  it('removes the phase param when returning to the default phase', () => {
    const { result } = renderHook(() => usePhaseWithPath(), {
      wrapper: createWrapper('/secretary/shows/show-1?focus=check-in&phase=today'),
    });

    act(() => {
      result.current.setPhase('setup');
    });

    expect(result.current.phase).toBe('setup');
    expect(result.current.search).toBe('?focus=check-in');
  });
});
