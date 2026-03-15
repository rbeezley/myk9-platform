import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ShowOfficials } from '@/components/shows/overview/ShowOfficials';

// Mock useResolvePerson — returns resolved people from store
vi.mock('@/hooks/useResolvePerson', () => ({
  useResolvePerson: () => (id: string | null | undefined) => {
    if (!id) return null;
    const people: Record<
      string,
      { name: string; profileImage?: string; email?: string; phone?: string }
    > = {
      'chair-1': {
        name: 'Sarah Johnson',
        profileImage: 'https://example.com/sarah.jpg',
        email: 'sarah@club.com',
        phone: '555-0100',
      },
      'sec-1': { name: 'Mike Williams', email: 'mike@club.com' },
    };
    return people[id] || { name: id, profileImage: undefined, email: undefined, phone: undefined };
  },
}));

// Mock DB query — not needed when store resolves successfully
vi.mock('@/services/database/queries/userQueries', () => ({
  getUserById: vi.fn().mockResolvedValue({ data: null, error: null }),
}));
vi.mock('@/services/mappers/userMappers', () => ({
  mapDatabaseToUser: vi.fn(),
}));

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('ShowOfficials', () => {
  it('renders chairman and secretary with names', () => {
    renderWithQuery(<ShowOfficials chairmanId="chair-1" secretaryId="sec-1" />);
    expect(screen.getByText('Sarah Johnson')).toBeInTheDocument();
    expect(screen.getByText('Mike Williams')).toBeInTheDocument();
  });

  it('renders role labels', () => {
    renderWithQuery(<ShowOfficials chairmanId="chair-1" secretaryId="sec-1" />);
    expect(screen.getByText('Chairman')).toBeInTheDocument();
    expect(screen.getByText('Secretary')).toBeInTheDocument();
  });

  it('renders only chairman when no secretary', () => {
    renderWithQuery(<ShowOfficials chairmanId="chair-1" />);
    expect(screen.getByText('Sarah Johnson')).toBeInTheDocument();
    expect(screen.queryByText('Secretary')).not.toBeInTheDocument();
  });

  it('renders only secretary when no chairman', () => {
    renderWithQuery(<ShowOfficials secretaryId="sec-1" />);
    expect(screen.getByText('Mike Williams')).toBeInTheDocument();
    expect(screen.queryByText('Chairman')).not.toBeInTheDocument();
  });

  it('returns null when neither is provided', () => {
    const { container } = renderWithQuery(<ShowOfficials />);
    expect(container.firstElementChild).toBeNull();
  });

  it('shows contact info when available', () => {
    renderWithQuery(<ShowOfficials chairmanId="chair-1" />);
    expect(screen.getByText('sarah@club.com')).toBeInTheDocument();
  });
});
