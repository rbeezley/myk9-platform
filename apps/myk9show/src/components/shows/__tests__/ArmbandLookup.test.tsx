import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { ArmbandLookup } from '../ArmbandLookup';

// --- Mocks ---

const mockUseArmbandLookup = vi.fn().mockReturnValue({
  data: null,
  isLoading: false,
  isError: false,
});

vi.mock('@/hooks/queries/useArmbandLookup', () => ({
  useArmbandLookup: (...args: unknown[]) => mockUseArmbandLookup(...args),
}));

vi.mock('react-router-dom', () => ({
  Link: ({
    to,
    children,
    ...rest
  }: {
    to: string;
    children: React.ReactNode;
  }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

/* eslint-disable @typescript-eslint/no-explicit-any */
vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: any) => <div data-testid="popover">{children}</div>,
  PopoverTrigger: ({ children }: any) => (
    <div data-testid="popover-trigger">{children}</div>
  ),
  PopoverContent: ({ children }: any) => (
    <div data-testid="popover-content">{children}</div>
  ),
}));

vi.mock('@/components/ui/input', () => ({
  Input: React.forwardRef<HTMLInputElement, any>((props, ref) => (
    <input ref={ref} {...props} />
  )),
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children, ...rest }: any) => <span {...rest}>{children}</span>,
}));
/* eslint-enable @typescript-eslint/no-explicit-any */

vi.mock('lucide-react', () => ({
  Search: () => <span data-testid="icon-search" />,
  Loader2: () => <span data-testid="icon-loader" />,
  Dog: () => <span data-testid="icon-dog" />,
  User: () => <span data-testid="icon-user" />,
  ClipboardList: () => <span data-testid="icon-clipboard" />,
}));

// --- Test data ---

const mockResult = {
  armband_number: '101',
  dog: { id: 'dog-1', name: 'Rex', breed: 'German Shepherd', sex: 'Male' },
  owner: { first_name: 'John', last_name: 'Smith' },
  entries: [
    {
      id: 'e1',
      entry_status: 'checked_in',
      handler: 'Jane Doe',
      class_name: 'Novice A',
      class_level: 'Level 1',
    },
    {
      id: 'e2',
      entry_status: 'registered',
      handler: null,
      class_name: 'Open B',
      class_level: null,
    },
  ],
};

// --- Helpers ---

function submitArmband(value: string) {
  const input = screen.getByPlaceholderText('Armband #');
  fireEvent.change(input, { target: { value } });
  const form = input.closest('form')!;
  fireEvent.submit(form);
}

// --- Tests ---

describe('ArmbandLookup', () => {
  beforeEach(() => {
    mockUseArmbandLookup.mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
    });
  });

  it('renders input with placeholder "Armband #"', () => {
    render(<ArmbandLookup showId="show-1" />);
    expect(screen.getByPlaceholderText('Armband #')).toBeInTheDocument();
  });

  it('does not open popover on empty input submission', () => {
    render(<ArmbandLookup showId="show-1" />);
    const input = screen.getByPlaceholderText('Armband #');
    const form = input.closest('form')!;
    fireEvent.submit(form);
    expect(screen.queryByText('Looking up...')).not.toBeInTheDocument();
    expect(screen.queryByText(/No dog found/)).not.toBeInTheDocument();
  });

  it('shows loading state', () => {
    mockUseArmbandLookup.mockReturnValue({
      data: null,
      isLoading: true,
      isError: false,
    });
    render(<ArmbandLookup showId="show-1" />);
    submitArmband('101');
    expect(screen.getByText('Looking up...')).toBeInTheDocument();
  });

  it('shows dog info on success', () => {
    mockUseArmbandLookup.mockReturnValue({
      data: mockResult,
      isLoading: false,
      isError: false,
    });
    render(<ArmbandLookup showId="show-1" />);
    submitArmband('101');
    expect(screen.getByText('Rex')).toBeInTheDocument();
    expect(screen.getByText('#101')).toBeInTheDocument();
    expect(screen.getByText(/German Shepherd/)).toBeInTheDocument();
    expect(screen.getByText('John Smith')).toBeInTheDocument();
  });

  it('shows entries on success', () => {
    mockUseArmbandLookup.mockReturnValue({
      data: mockResult,
      isLoading: false,
      isError: false,
    });
    render(<ArmbandLookup showId="show-1" />);
    submitArmband('101');
    expect(screen.getByText(/Novice A/)).toBeInTheDocument();
    expect(screen.getByText(/Level 1/)).toBeInTheDocument();
    expect(screen.getByText('checked_in')).toBeInTheDocument();
  });

  it('shows handler when present', () => {
    mockUseArmbandLookup.mockReturnValue({
      data: mockResult,
      isLoading: false,
      isError: false,
    });
    render(<ArmbandLookup showId="show-1" />);
    submitArmband('101');
    expect(screen.getByText('Handler: Jane Doe')).toBeInTheDocument();
  });

  it('does not show handler when null', () => {
    mockUseArmbandLookup.mockReturnValue({
      data: mockResult,
      isLoading: false,
      isError: false,
    });
    render(<ArmbandLookup showId="show-1" />);
    submitArmband('101');
    // There should be exactly one "Handler:" text (for the first entry only)
    const handlerElements = screen.getAllByText(/^Handler:/);
    expect(handlerElements).toHaveLength(1);
  });

  it('shows not-found state', () => {
    mockUseArmbandLookup.mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
    });
    render(<ArmbandLookup showId="show-1" />);
    submitArmband('999');
    expect(
      screen.getByText('No dog found with armband #999'),
    ).toBeInTheDocument();
  });

  it('shows error state', () => {
    mockUseArmbandLookup.mockReturnValue({
      data: null,
      isLoading: false,
      isError: true,
    });
    render(<ArmbandLookup showId="show-1" />);
    submitArmband('101');
    expect(screen.getByText(/Lookup failed/)).toBeInTheDocument();
  });

  it('shows view profile link', () => {
    mockUseArmbandLookup.mockReturnValue({
      data: mockResult,
      isLoading: false,
      isError: false,
    });
    render(<ArmbandLookup showId="show-1" />);
    submitArmband('101');
    const link = screen.getByText(/View full profile/);
    expect(link).toBeInTheDocument();
    expect(link.closest('a')).toHaveAttribute('href', '/dogs/dog-1');
  });
});
