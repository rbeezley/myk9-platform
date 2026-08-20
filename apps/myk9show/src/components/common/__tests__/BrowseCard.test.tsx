import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BrowseCard, BrowseCardAvatar, BrowseCardDetail } from '../BrowseCard';
import { PawPrint } from 'lucide-react';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async importOriginal => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

beforeEach(() => {
  vi.clearAllMocks();
});

/** The card's name is a real <Link>, so it needs a router in the tree. */
const renderCard = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('BrowseCard', () => {
  it('renders the entity name', () => {
    renderCard(
      <BrowseCard href="/dogs/1" actionLabel="View Dog" name="Maggie" avatar={<div />}>
        {null}
      </BrowseCard>
    );
    expect(screen.getByText('Maggie')).toBeInTheDocument();
  });

  it('renders the action button with provided label', () => {
    renderCard(<BrowseCard href="/dogs/1" actionLabel="View Dog" name="Maggie" avatar={<div />} />);
    expect(screen.getByRole('button', { name: /view dog/i })).toBeInTheDocument();
  });

  // The card used to be a div[role=link] driven by navigate(), which meant no
  // href: cmd-click, middle-click, "open in new tab" and the browser's URL
  // preview all did nothing, and the accessible name computed empty.
  it('exposes a real link carrying the href, named for the entity', () => {
    renderCard(
      <BrowseCard href="/dogs/42" actionLabel="View Dog" name="Maggie" avatar={<div />} />
    );
    const link = screen.getByRole('link', { name: 'Maggie' });
    expect(link).toHaveAttribute('href', '/dogs/42');
  });

  it('stretches the link across the whole card so the card stays clickable', () => {
    renderCard(<BrowseCard href="/dogs/42" name="Maggie" avatar={<div />} />);
    expect(screen.getByRole('link', { name: 'Maggie' }).className).toMatch(/after:inset-0/);
  });

  it('clicking the action button navigates without bubbling a second navigation', () => {
    renderCard(
      <BrowseCard href="/dogs/42" actionLabel="View Dog" name="Maggie" avatar={<div />} />
    );
    fireEvent.click(screen.getByRole('button', { name: /view dog/i }));
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/dogs/42');
  });

  it('renders badges when provided', () => {
    renderCard(
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
    renderCard(
      <BrowseCard href="/dogs/1" actionLabel="View Dog" name="Maggie" avatar={<div />}>
        <span>Golden Retriever</span>
      </BrowseCard>
    );
    expect(screen.getByText('Golden Retriever')).toBeInTheDocument();
  });

  it('renders the avatar slot', () => {
    renderCard(
      <BrowseCard
        href="/dogs/1"
        actionLabel="View Dog"
        name="Maggie"
        avatar={<img alt="dog avatar" src="/dog.jpg" />}
      />
    );
    expect(screen.getByAltText('dog avatar')).toBeInTheDocument();
  });

  it('omits the action button entirely when actionLabel is not provided', () => {
    renderCard(<BrowseCard href="/dogs/1" name="Maggie" avatar={<div />} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('still links out when actionLabel is omitted', () => {
    renderCard(<BrowseCard href="/dogs/42" name="Maggie" avatar={<div />} />);
    expect(screen.getByRole('link', { name: 'Maggie' })).toHaveAttribute('href', '/dogs/42');
  });
});

describe('BrowseCardAvatar', () => {
  it('renders an img when src is provided', () => {
    renderCard(<BrowseCardAvatar src="/dog.jpg" fallback="M" alt="Maggie" />);
    const img = screen.getByRole('img', { name: 'Maggie' });
    expect(img).toHaveAttribute('src', '/dog.jpg');
  });

  it('renders the fallback letter when src is absent', () => {
    renderCard(<BrowseCardAvatar fallback="M" alt="Maggie" />);
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
    renderCard(
      <BrowseCardDetail icon={<PawPrint className="h-3.5 w-3.5" />}>
        Golden Retriever
      </BrowseCardDetail>
    );
    expect(screen.getByText('Golden Retriever')).toBeInTheDocument();
  });
});
