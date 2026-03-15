import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ShowOfficials } from '@/components/shows/overview/ShowOfficials';

// Mock useResolvePerson
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

describe('ShowOfficials', () => {
  it('renders chairman and secretary with names', () => {
    render(<ShowOfficials chairmanId="chair-1" secretaryId="sec-1" />);
    expect(screen.getByText('Sarah Johnson')).toBeInTheDocument();
    expect(screen.getByText('Mike Williams')).toBeInTheDocument();
  });

  it('renders role labels', () => {
    render(<ShowOfficials chairmanId="chair-1" secretaryId="sec-1" />);
    expect(screen.getByText('Chairman')).toBeInTheDocument();
    expect(screen.getByText('Secretary')).toBeInTheDocument();
  });

  it('renders only chairman when no secretary', () => {
    render(<ShowOfficials chairmanId="chair-1" />);
    expect(screen.getByText('Sarah Johnson')).toBeInTheDocument();
    expect(screen.queryByText('Secretary')).not.toBeInTheDocument();
  });

  it('renders only secretary when no chairman', () => {
    render(<ShowOfficials secretaryId="sec-1" />);
    expect(screen.getByText('Mike Williams')).toBeInTheDocument();
    expect(screen.queryByText('Chairman')).not.toBeInTheDocument();
  });

  it('returns null when neither is provided', () => {
    const { container } = render(<ShowOfficials />);
    expect(container.firstElementChild).toBeNull();
  });

  it('shows contact info when available', () => {
    render(<ShowOfficials chairmanId="chair-1" />);
    expect(screen.getByText('sarah@club.com')).toBeInTheDocument();
  });
});
