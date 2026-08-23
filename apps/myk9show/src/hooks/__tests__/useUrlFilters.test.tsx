import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, render, act } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate, type NavigateFunction } from 'react-router-dom';
import { useUrlFilters } from '@/hooks/useUrlFilters';

interface DogFilters extends Record<string, string> {
  search: string;
  breed: string;
  sex: string;
}

const DOG_DEFAULTS: DogFilters = { search: '', breed: 'all', sex: 'all' };

interface RouterProbe {
  search: string;
  pathname: string;
  navigate: NavigateFunction;
}

function setupRouter(initialEntries: string[]) {
  const probe: RouterProbe = { search: '', pathname: '', navigate: (() => {}) as NavigateFunction };

  // Written from an effect, not during render — `react-hooks/immutability`
  // rejects assigning to a captured object from a component body.
  const Probe: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    React.useEffect(() => {
      probe.search = location.search;
      probe.pathname = location.pathname;
      probe.navigate = navigate;
    });
    return null;
  };

  const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <MemoryRouter initialEntries={initialEntries}>
      {children}
      <Probe />
    </MemoryRouter>
  );

  return { probe, wrapper };
}

function renderFilters(initialEntries: string[], debounceMs = 300) {
  const { probe, wrapper } = setupRouter(initialEntries);
  const view = renderHook(() => useUrlFilters(DOG_DEFAULTS, { debounceMs }), { wrapper });
  return { probe, ...view };
}

describe('useUrlFilters', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('seeds filter state from the query string on first render', () => {
    const { result } = renderFilters(['/dogs?search=max&breed=Poodle']);
    expect(result.current[0]).toEqual({ search: 'max', breed: 'Poodle', sex: 'all' });
  });

  it('falls back to the defaults when the query string is empty', () => {
    const { result } = renderFilters(['/dogs']);
    expect(result.current[0]).toEqual(DOG_DEFAULTS);
  });

  it('updates the returned value immediately but the URL only after the debounce', () => {
    const { result, probe } = renderFilters(['/dogs']);

    act(() => {
      result.current[1](prev => ({ ...prev, search: 'ma' }));
    });

    // Local draft is instant — typing must never wait on the router.
    expect(result.current[0].search).toBe('ma');
    expect(probe.search).toBe('');

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(new URLSearchParams(probe.search).get('search')).toBe('ma');
  });

  it('collapses a burst of keystrokes into a single URL write', () => {
    const { result, probe } = renderFilters(['/dogs']);

    for (const value of ['m', 'ma', 'max']) {
      act(() => {
        result.current[1](prev => ({ ...prev, search: value }));
      });
      act(() => {
        vi.advanceTimersByTime(100); // shorter than the 300ms window
      });
    }

    expect(probe.search).toBe('');

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(new URLSearchParams(probe.search).get('search')).toBe('max');
  });

  it('writes a non-text filter immediately, without waiting for the debounce', () => {
    const { result, probe } = renderFilters(['/dogs']);

    act(() => {
      result.current[1](prev => ({ ...prev, breed: 'Poodle' }));
    });

    expect(new URLSearchParams(probe.search).get('breed')).toBe('Poodle');
  });

  it('flushes pending search text when a chip filter commits', () => {
    const { result, probe } = renderFilters(['/dogs']);

    act(() => {
      result.current[1](prev => ({ ...prev, search: 'max' }));
    });
    expect(probe.search).toBe('');

    act(() => {
      result.current[1](prev => ({ ...prev, breed: 'Poodle' }));
    });

    const params = new URLSearchParams(probe.search);
    expect(params.get('breed')).toBe('Poodle');
    expect(params.get('search')).toBe('max');
  });

  it('omits values that equal their default and removes a cleared filter', () => {
    const { result, probe } = renderFilters(['/dogs?breed=Poodle']);

    act(() => {
      result.current[1](prev => ({ ...prev, sex: 'female' }));
    });

    expect(new URLSearchParams(probe.search).get('sex')).toBe('female');

    act(() => {
      result.current[1](DOG_DEFAULTS);
    });

    expect(probe.search).toBe('');
  });

  it('preserves ?add=true across a filter change', () => {
    const { result, probe } = renderFilters(['/dogs?add=true']);

    act(() => {
      result.current[1](prev => ({ ...prev, breed: 'Poodle' }));
    });

    const params = new URLSearchParams(probe.search);
    expect(params.get('add')).toBe('true');
    expect(params.get('breed')).toBe('Poodle');
  });

  it('preserves ?add=true when the debounced search write lands', () => {
    const { result, probe } = renderFilters(['/dogs?add=true']);

    act(() => {
      result.current[1](prev => ({ ...prev, search: 'max' }));
    });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    const params = new URLSearchParams(probe.search);
    expect(params.get('add')).toBe('true');
    expect(params.get('search')).toBe('max');
  });

  it('preserves ?tab= and ?view= so the Shows page keeps its tab and layout', () => {
    const { result, probe } = renderFilters(['/shows?tab=managing&view=cards']);

    act(() => {
      result.current[1](prev => ({ ...prev, breed: 'Poodle' }));
    });

    const params = new URLSearchParams(probe.search);
    expect(params.get('tab')).toBe('managing');
    expect(params.get('view')).toBe('cards');
  });

  it('replaces history rather than pushing, so Back leaves the page entirely', () => {
    const { result, probe } = renderFilters(['/shows', '/dogs']);

    act(() => {
      result.current[1](prev => ({ ...prev, breed: 'Poodle' }));
    });
    act(() => {
      result.current[1](prev => ({ ...prev, sex: 'female' }));
    });
    expect(probe.pathname).toBe('/dogs');

    act(() => {
      probe.navigate(-1);
    });

    // With a pushed entry per filter change this would land back on /dogs.
    expect(probe.pathname).toBe('/shows');
  });

  it('adopts filters from an external URL change (back/forward, deep link)', () => {
    const { result, probe } = renderFilters(['/dogs']);

    act(() => {
      probe.navigate('/dogs?breed=Beagle&search=rex');
    });

    expect(result.current[0]).toEqual({ search: 'rex', breed: 'Beagle', sex: 'all' });
  });

  it('does not let a stale URL revert a keystroke that has not been written yet', () => {
    const { result } = renderFilters(['/dogs?breed=Poodle']);

    act(() => {
      result.current[1](prev => ({ ...prev, search: 'ma' }));
    });

    // The URL still reads `?breed=Poodle` with no search; the adopt effect must
    // not overwrite the in-flight draft with it.
    expect(result.current[0].search).toBe('ma');

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current[0]).toEqual({ search: 'ma', breed: 'Poodle', sex: 'all' });
  });

  it('composes two setFilters calls made in the same tick', () => {
    const { result, probe } = renderFilters(['/dogs']);

    act(() => {
      result.current[1](prev => ({ ...prev, breed: 'Poodle' }));
      result.current[1](prev => ({ ...prev, sex: 'female' }));
    });

    const params = new URLSearchParams(probe.search);
    expect(params.get('breed')).toBe('Poodle');
    expect(params.get('sex')).toBe('female');
  });

  it('ignores a set that changes nothing', () => {
    const { result, probe } = renderFilters(['/dogs']);

    act(() => {
      result.current[1](prev => ({ ...prev }));
    });

    expect(probe.search).toBe('');
    expect(result.current[0]).toEqual(DOG_DEFAULTS);
  });

  it('does not revert a pending keystroke when an unrelated param changes', () => {
    const { result, probe } = renderFilters(['/shows']);

    act(() => {
      result.current[1](prev => ({ ...prev, search: 'ma' }));
    });

    // `useUrlTab` writes `?tab=` while our search write is still in flight.
    act(() => {
      probe.navigate('/shows?tab=managing', { replace: true });
    });

    expect(result.current[0].search).toBe('ma');

    act(() => {
      vi.advanceTimersByTime(300);
    });

    // ...and the write merges onto the CURRENT params, so the tab survives too.
    const params = new URLSearchParams(probe.search);
    expect(params.get('search')).toBe('ma');
    expect(params.get('tab')).toBe('managing');
  });

  it('does not write to the URL after the filtered view unmounts', () => {
    const probe = { search: '', navigate: (() => {}) as NavigateFunction };

    const Probe: React.FC = () => {
      const location = useLocation();
      const navigate = useNavigate();
      React.useEffect(() => {
        probe.search = location.search;
        probe.navigate = navigate;
      });
      return null;
    };

    // The hook lives in a child that can go away while the router stays up —
    // otherwise the probe unmounts too and could not observe a late write.
    const Filters: React.FC = () => {
      const [, setFilters] = useUrlFilters(DOG_DEFAULTS, { debounceMs: 300 });
      React.useEffect(() => {
        setFilters(prev => ({ ...prev, search: 'max' }));
      }, [setFilters]);
      return null;
    };

    const Host: React.FC<{ mounted: boolean }> = ({ mounted }) => (
      <MemoryRouter initialEntries={['/dogs']}>
        <Probe />
        {mounted ? <Filters /> : null}
      </MemoryRouter>
    );

    const { rerender } = render(<Host mounted />);
    expect(probe.search).toBe('');

    rerender(<Host mounted={false} />);
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(probe.search).toBe('');
  });
});
