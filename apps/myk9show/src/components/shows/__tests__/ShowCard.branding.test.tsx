import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ShowCard } from '../ShowCard';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});

const baseProps = {
  id: '1',
  title: 'Bluegrass Classic 2026',
  date: '2026-03-15',
  location: 'Louisville, KY',
  imageUrl: '',
};

describe('ShowCard branding', () => {
  it('renders cover image with lazy loading when coverImageUrl provided', () => {
    render(<ShowCard {...baseProps} coverImageUrl="https://example.com/cover.webp" />);
    const img = screen.getByRole('img', { name: /cover/i });
    expect(img).toHaveAttribute('src', 'https://example.com/cover.webp');
    expect(img).toHaveAttribute('loading', 'lazy');
  });

  it('renders gradient placeholder when no coverImageUrl', () => {
    render(<ShowCard {...baseProps} />);
    expect(screen.queryByRole('img', { name: /cover/i })).not.toBeInTheDocument();
  });

  it('renders accent color bar when accentColor provided', () => {
    render(<ShowCard {...baseProps} accentColor="#dc2626" />);
    const bar = screen.getByTestId('accent-bar');
    expect(bar).toHaveStyle({ backgroundColor: '#dc2626' });
  });

  it('does not render accent bar when accentColor is null', () => {
    render(<ShowCard {...baseProps} accentColor={null} />);
    expect(screen.queryByTestId('accent-bar')).not.toBeInTheDocument();
  });

  it('does not render accent bar when accentColor is undefined', () => {
    render(<ShowCard {...baseProps} />);
    expect(screen.queryByTestId('accent-bar')).not.toBeInTheDocument();
  });

  it('renders imageUrl fallback when no coverImageUrl', () => {
    render(<ShowCard {...baseProps} imageUrl="https://example.com/image.jpg" />);
    // imageUrl img does not have "cover" in alt, so it shouldn't match /cover/i
    expect(screen.queryByRole('img', { name: /cover/i })).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: baseProps.title })).toHaveAttribute(
      'src',
      'https://example.com/image.jpg'
    );
  });

  it('prefers coverImageUrl over imageUrl when both are provided', () => {
    render(
      <ShowCard
        {...baseProps}
        imageUrl="https://example.com/image.jpg"
        coverImageUrl="https://example.com/cover.webp"
      />
    );
    const coverImg = screen.getByRole('img', { name: /cover/i });
    expect(coverImg).toHaveAttribute('src', 'https://example.com/cover.webp');
    // imageUrl img should not be rendered
    expect(screen.queryByRole('img', { name: baseProps.title })).not.toBeInTheDocument();
  });
});
