import { act, renderHook, waitFor } from '@testing-library/react';
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
  it('returns show-desk when no phase is present (Phase B2a default, B5 canonical)', () => {
    const { result } = renderHook(() => useActivePhase(), {
      wrapper: createWrapper('/shows/show-1/show-desk'),
    });

    expect(result.current[0]).toBe('show-desk');
  });

  it('reads a valid phase from the URL', () => {
    const { result } = renderHook(() => useActivePhase(), {
      wrapper: createWrapper('/shows/show-1/setup?phase=setup'),
    });

    expect(result.current[0]).toBe('setup');
  });

  it('falls back to the default for an invalid phase', () => {
    const { result } = renderHook(() => useActivePhase(), {
      wrapper: createWrapper('/shows/show-1/show-desk?phase=dashboard'),
    });

    expect(result.current[0]).toBe('show-desk');
  });

  it('updates the phase while preserving unrelated query params', () => {
    const { result } = renderHook(() => usePhaseWithPath(), {
      wrapper: createWrapper('/shows/show-1/setup?focus=check-in&phase=setup'),
    });

    act(() => {
      result.current.setPhase('show-desk');
    });

    // show-desk is the default phase, so the param is cleared.
    expect(result.current.phase).toBe('show-desk');
    expect(result.current.search).toContain('focus=check-in');
    expect(result.current.search).not.toContain('phase=');
  });

  it('preserves the phase=setup param when leaving the default', () => {
    const { result } = renderHook(() => usePhaseWithPath(), {
      wrapper: createWrapper('/shows/show-1/show-desk?focus=check-in'),
    });

    act(() => {
      result.current.setPhase('setup');
    });

    expect(result.current.phase).toBe('setup');
    expect(result.current.search).toContain('focus=check-in');
    expect(result.current.search).toContain('phase=setup');
  });

  // Phase B5: ?phase=today and ?phase=wrap-up are legacy values from before
  // the workbench collapse. They resolve to Show Desk and the URL param is
  // auto-cleaned on mount so the stale value doesn't linger.
  it('redirects legacy ?phase=today to show-desk and cleans the URL', async () => {
    const { result } = renderHook(() => usePhaseWithPath(), {
      wrapper: createWrapper('/shows/show-1/show-desk?phase=today'),
    });

    expect(result.current.phase).toBe('show-desk');
    await waitFor(() => {
      expect(result.current.search).not.toContain('phase=');
    });
  });

  it('redirects legacy ?phase=wrap-up to show-desk and cleans the URL', async () => {
    const { result } = renderHook(() => usePhaseWithPath(), {
      wrapper: createWrapper('/shows/show-1/show-desk?phase=wrap-up'),
    });

    expect(result.current.phase).toBe('show-desk');
    await waitFor(() => {
      expect(result.current.search).not.toContain('phase=');
    });
  });
});
