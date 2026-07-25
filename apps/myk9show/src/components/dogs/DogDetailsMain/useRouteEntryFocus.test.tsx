import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import React, { useRef } from 'react';
import { MemoryRouter, type NavigationType } from 'react-router-dom';
import { isRouteEntryNavigation, useRouteEntryFocus } from './useRouteEntryFocus';

const mockUseNavigationType = vi.fn<() => NavigationType>();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigationType: () => mockUseNavigationType(),
  };
});

describe('isRouteEntryNavigation', () => {
  it('treats PUSH and REPLACE as route entries', () => {
    expect(isRouteEntryNavigation('PUSH' as NavigationType)).toBe(true);
    expect(isRouteEntryNavigation('REPLACE' as NavigationType)).toBe(true);
  });

  it('does not treat POP (Back/Forward) as a route entry', () => {
    expect(isRouteEntryNavigation('POP' as NavigationType)).toBe(false);
  });
});

const Harness: React.FC<{ entryKey: string }> = ({ entryKey }) => {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useRouteEntryFocus(headingRef, entryKey);
  return (
    <h1 ref={headingRef} tabIndex={-1}>
      Heading for {entryKey}
    </h1>
  );
};

describe('useRouteEntryFocus', () => {
  beforeEach(() => {
    mockUseNavigationType.mockReset();
    window.scrollTo = vi.fn();
  });

  it('focuses and scrolls to top on a PUSH route entry', () => {
    mockUseNavigationType.mockReturnValue('PUSH' as NavigationType);
    const { getByText } = render(
      <MemoryRouter>
        <Harness entryKey="dog-1" />
      </MemoryRouter>
    );

    expect(getByText('Heading for dog-1')).toHaveFocus();
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'auto' });
  });

  it('does not focus or scroll on a POP (Back/Forward) navigation', () => {
    mockUseNavigationType.mockReturnValue('POP' as NavigationType);
    const { getByText } = render(
      <MemoryRouter>
        <Harness entryKey="dog-1" />
      </MemoryRouter>
    );

    expect(getByText('Heading for dog-1')).not.toHaveFocus();
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it('re-fires when the entry key (dog id) changes without unmounting', () => {
    mockUseNavigationType.mockReturnValue('PUSH' as NavigationType);
    const { rerender, getByText } = render(
      <MemoryRouter>
        <Harness entryKey="dog-1" />
      </MemoryRouter>
    );
    expect(window.scrollTo).toHaveBeenCalledTimes(1);

    rerender(
      <MemoryRouter>
        <Harness entryKey="dog-2" />
      </MemoryRouter>
    );

    expect(window.scrollTo).toHaveBeenCalledTimes(2);
    expect(getByText('Heading for dog-2')).toHaveFocus();
  });

  it('does not re-fire on a re-render with the same entry key', () => {
    mockUseNavigationType.mockReturnValue('PUSH' as NavigationType);
    const { rerender } = render(
      <MemoryRouter>
        <Harness entryKey="dog-1" />
      </MemoryRouter>
    );
    expect(window.scrollTo).toHaveBeenCalledTimes(1);

    rerender(
      <MemoryRouter>
        <Harness entryKey="dog-1" />
      </MemoryRouter>
    );

    expect(window.scrollTo).toHaveBeenCalledTimes(1);
  });
});
