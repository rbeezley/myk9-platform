import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { BrowseCard, BrowseCardAvatar, BrowseCardDetail } from '../BrowseCard';
import { PawPrint } from 'lucide-react';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('BrowseCard', () => {
  it('renders the entity name', () => {
    render(
      <BrowseCard href="/dogs/1" actionLabel="View Dog" name="Maggie" avatar={<div />}>
        {null}
      </BrowseCard>
    );
    expect(screen.getByText('Maggie')).toBeInTheDocument();
  });

  it('renders the action button with provided label', () => {
    render(<BrowseCard href="/dogs/1" actionLabel="View Dog" name="Maggie" avatar={<div />} />);
    expect(screen.getByRole('button', { name: /view dog/i })).toBeInTheDocument();
  });

  it('clicking the card navigates to href', () => {
    render(<BrowseCard href="/dogs/42" actionLabel="View Dog" name="Maggie" avatar={<div />} />);
    fireEvent.click(screen.getByRole('link'));
    expect(mockNavigate).toHaveBeenCalledWith('/dogs/42');
  });

  it('pressing Enter on the card navigates to href', () => {
    render(<BrowseCard href="/dogs/42" actionLabel="View Dog" name="Maggie" avatar={<div />} />);
    fireEvent.keyDown(screen.getByRole('link'), { key: 'Enter' });
    expect(mockNavigate).toHaveBeenCalledWith('/dogs/42');
  });

  it('clicking the action button navigates without bubbling a second navigation', () => {
    render(<BrowseCard href="/dogs/42" actionLabel="View Dog" name="Maggie" avatar={<div />} />);
    fireEvent.click(screen.getByRole('button', { name: /view dog/i }));
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/dogs/42');
  });

  it('renders badges when provided', () => {
    render(
      <BrowseCard
        href="/dogs/1"
        actionLabel="View Dog"
        name="Maggie"
        avatar={<div />}
        badges={<span>Active</span>}
      />
    );
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('renders children when provided', () => {
    render(
      <BrowseCard href="/dogs/1" actionLabel="View Dog" name="Maggie" avatar={<div />}>
        <span>Golden Retriever</span>
      </BrowseCard>
    );
    expect(screen.getByText('Golden Retriever')).toBeInTheDocument();
  });

  it('renders the avatar slot', () => {
    render(
      <BrowseCard
        href="/dogs/1"
        actionLabel="View Dog"
        name="Maggie"
        avatar={<img alt="dog avatar" src="/dog.jpg" />}
      />
    );
    expect(screen.getByAltText('dog avatar')).toBeInTheDocument();
  });
});

describe('BrowseCardAvatar', () => {
  it('renders an img when src is provided', () => {
    render(<BrowseCardAvatar src="/dog.jpg" fallback="M" alt="Maggie" />);
    const img = screen.getByRole('img', { name: 'Maggie' });
    expect(img).toHaveAttribute('src', '/dog.jpg');
  });

  it('renders the fallback letter when src is absent', () => {
    render(<BrowseCardAvatar fallback="M" alt="Maggie" />);
    expect(screen.getByText('M')).toBeInTheDocument();
  });

  it('applies rounded-full for circle shape (default)', () => {
    const { container } = render(<BrowseCardAvatar fallback="M" alt="Maggie" />);
    expect(container.querySelector('.rounded-full')).toBeInTheDocument();
  });

  it('applies rounded-lg for square shape', () => {
    const { container } = render(<BrowseCardAvatar fallback="M" alt="Maggie" shape="square" />);
    expect(container.querySelector('.rounded-lg')).toBeInTheDocument();
  });
});

describe('BrowseCardDetail', () => {
  it('renders children text', () => {
    render(
      <BrowseCardDetail icon={<PawPrint className="h-3.5 w-3.5" />}>
        Golden Retriever
      </BrowseCardDetail>
    );
    expect(screen.getByText('Golden Retriever')).toBeInTheDocument();
  });
});
