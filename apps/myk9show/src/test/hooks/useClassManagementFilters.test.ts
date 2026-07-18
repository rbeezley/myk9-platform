import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { createElement, useEffect, type ReactNode } from 'react';
import { useClassManagementFilters } from '@/hooks/useClassManagementFilters';

function LocationProbe({ onSearch }: { onSearch?: (search: string) => void }) {
  const location = useLocation();

  useEffect(() => {
    onSearch?.(location.search);
  }, [location.search, onSearch]);

  return null;
}

function createWrapper(initialEntry = '/', onSearch?: (search: string) => void) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      MemoryRouter,
      { initialEntries: [initialEntry] },
      createElement(LocationProbe, { onSearch }),
      children
    );
  };
}

describe('useClassManagementFilters', () => {
  it('defaults to status=all, empty search, element=all', () => {
    const { result } = renderHook(() => useClassManagementFilters(), {
      wrapper: createWrapper('/classes'),
    });

    expect(result.current.status).toBe('all');
    expect(result.current.search).toBe('');
    expect(result.current.element).toBe('all');
  });

  it('reads an initial status/search/element from the URL', () => {
    const { result } = renderHook(() => useClassManagementFilters(), {
      wrapper: createWrapper('/classes?status=in_progress&search=fido&element=obedience'),
    });

    expect(result.current.status).toBe('in_progress');
    expect(result.current.search).toBe('fido');
    expect(result.current.element).toBe('obedience');
  });

  it('writes status changes to the URL and drops the param on "all"', () => {
    let latestSearch = '';
    const { result } = renderHook(() => useClassManagementFilters(), {
      wrapper: createWrapper('/classes', search => {
        latestSearch = search;
      }),
    });

    act(() => {
      result.current.setStatus('completed');
    });
    expect(result.current.status).toBe('completed');
    expect(latestSearch).toContain('status=completed');

    act(() => {
      result.current.setStatus('all');
    });
    expect(result.current.status).toBe('all');
    expect(latestSearch).not.toContain('status=');
  });

  it('clearFilters resets search, status, and element together', () => {
    const { result } = renderHook(() => useClassManagementFilters(), {
      wrapper: createWrapper('/classes?status=completed&search=fido&element=obedience'),
    });

    act(() => {
      result.current.clearFilters();
    });

    expect(result.current.status).toBe('all');
    expect(result.current.search).toBe('');
    expect(result.current.element).toBe('all');
  });

  it('normalizes an invalid stored status back to "all"', () => {
    const { result } = renderHook(() => useClassManagementFilters(), {
      wrapper: createWrapper('/classes?status=bogus'),
    });

    expect(result.current.status).toBe('all');
  });
});
