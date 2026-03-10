import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ShowBrandedHero } from '../ShowBrandedHero';

// Mock navigation if needed
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});

const baseProps = {
  showName: 'Bluegrass Classic 2026',
  location: 'Louisville, KY',
  startDate: '2026-03-15',
  endDate: '2026-03-17',
  clubName: 'Kennel Club of Louisville',
  organization: 'AKC',
  status: 'accepting_entries',
};

describe('ShowBrandedHero', () => {
  it('renders show name and details', () => {
    render(<ShowBrandedHero {...baseProps} />);
    expect(screen.getByText('Bluegrass Classic 2026')).toBeInTheDocument();
    expect(screen.getByText(/Louisville, KY/)).toBeInTheDocument();
    expect(screen.getByText(/Kennel Club of Louisville/)).toBeInTheDocument();
  });

  it('renders cover image when provided', () => {
    render(<ShowBrandedHero {...baseProps} coverImage="https://example.com/cover.webp" />);
    const img = screen.getByRole('img', { name: /cover/i });
    expect(img).toHaveAttribute('src', 'https://example.com/cover.webp');
  });

  it('renders gradient fallback when no cover image', () => {
    render(<ShowBrandedHero {...baseProps} />);
    expect(screen.queryByRole('img', { name: /cover/i })).not.toBeInTheDocument();
    expect(screen.getByTestId('gradient-placeholder')).toBeInTheDocument();
  });

  it('renders club logo when provided', () => {
    render(<ShowBrandedHero {...baseProps} logo="https://example.com/logo.webp" />);
    const logo = screen.getByRole('img', { name: /club logo/i });
    expect(logo).toHaveAttribute('src', 'https://example.com/logo.webp');
  });

  it('renders initials badge when no logo', () => {
    render(<ShowBrandedHero {...baseProps} />);
    // "KC" initials from "Kennel Club of Louisville" (first letter of capitalized words)
    expect(screen.getByText('KC')).toBeInTheDocument();
  });

  it('renders accent color bar when provided', () => {
    render(<ShowBrandedHero {...baseProps} accentColor="#dc2626" />);
    const bar = screen.getByTestId('accent-bar');
    expect(bar).toHaveStyle({ backgroundColor: '#dc2626' });
  });

  it('renders status badge', () => {
    render(<ShowBrandedHero {...baseProps} status="accepting_entries" />);
    expect(screen.getByText(/accepting entries/i)).toBeInTheDocument();
  });
});
