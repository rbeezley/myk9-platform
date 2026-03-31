import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ShowOfficials } from '@/components/shows/overview/ShowOfficials';
import type { ShowOfficials as ShowOfficialsData } from '@/hooks/queries/useShowOfficials';

const fullData: ShowOfficialsData = {
  chairmen: [
    {
      personId: 'chair-1',
      firstName: 'Sarah',
      lastName: 'Johnson',
      email: 'sarah@club.com',
      role: 'chairman',
    },
  ],
  secretaries: [
    {
      personId: 'sec-1',
      firstName: 'Mike',
      lastName: 'Williams',
      email: 'mike@club.com',
      role: 'secretary',
    },
  ],
  stewards: [],
};

const emptyData: ShowOfficialsData = { chairmen: [], secretaries: [], stewards: [] };

let mockData: ShowOfficialsData | null = fullData;

vi.mock('@/hooks/queries/useShowOfficials', () => ({
  useShowOfficials: () => ({ data: mockData }),
}));

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('ShowOfficials', () => {
  it('renders chairman and secretary with names', () => {
    mockData = fullData;
    renderWithQuery(<ShowOfficials showId="show-1" />);
    expect(screen.getByText('Sarah Johnson')).toBeInTheDocument();
    expect(screen.getByText('Mike Williams')).toBeInTheDocument();
  });

  it('renders role labels', () => {
    mockData = fullData;
    renderWithQuery(<ShowOfficials showId="show-1" />);
    expect(screen.getByText('Chairman')).toBeInTheDocument();
    expect(screen.getByText('Secretary')).toBeInTheDocument();
  });

  it('shows contact info when available', () => {
    mockData = fullData;
    renderWithQuery(<ShowOfficials showId="show-1" />);
    expect(screen.getByText('sarah@club.com')).toBeInTheDocument();
  });

  it('returns null when no officials data', () => {
    mockData = null;
    const { container } = renderWithQuery(<ShowOfficials showId="show-1" />);
    expect(container.firstElementChild).toBeNull();
  });

  it('returns null when officials list is empty', () => {
    mockData = emptyData;
    const { container } = renderWithQuery(<ShowOfficials showId="show-1" />);
    expect(container.firstElementChild).toBeNull();
  });
});
