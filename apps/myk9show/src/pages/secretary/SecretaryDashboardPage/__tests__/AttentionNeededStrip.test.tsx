import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import { AttentionNeededStrip } from '../AttentionNeededStrip';
import type { AttentionItem } from '@/hooks/useMyShows';

function renderStrip(items: AttentionItem[]) {
  return render(
    <MemoryRouter>
      <AttentionNeededStrip items={items} />
    </MemoryRouter>
  );
}

describe('AttentionNeededStrip', () => {
  it('renders null when items is empty', () => {
    const { container } = renderStrip([]);
    expect(container.firstChild).toBeNull();
  });

  it('renders the "Needs attention" header when items exist', () => {
    renderStrip([
      { showId: 's1', showName: 'Spring Trial', kind: 'urgent', text: 'Check-in open', href: '/shows/s1' },
    ]);
    expect(screen.getByText(/needs attention/i)).toBeInTheDocument();
  });

  it('renders each item text and show name', () => {
    renderStrip([
      { showId: 's1', showName: 'Spring Trial', kind: 'urgent', text: 'Check-in open', href: '/shows/s1' },
      { showId: 's2', showName: 'Fall Classic', kind: 'info', text: 'Entries close in 3 days', href: '/shows/s2' },
    ]);
    expect(screen.getByText('Check-in open')).toBeInTheDocument();
    expect(screen.getByText('Spring Trial')).toBeInTheDocument();
    expect(screen.getByText('Entries close in 3 days')).toBeInTheDocument();
    expect(screen.getByText('Fall Classic')).toBeInTheDocument();
  });

  it('links each item to its href', () => {
    renderStrip([
      { showId: 's1', showName: 'Spring Trial', kind: 'urgent', text: 'Check-in open', href: '/shows/s1' },
    ]);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/shows/s1');
  });

  it('renders multiple items as separate links', () => {
    renderStrip([
      { showId: 's1', showName: 'A', kind: 'urgent', text: 'Item 1', href: '/shows/s1' },
      { showId: 's2', showName: 'B', kind: 'info', text: 'Item 2', href: '/shows/s2' },
      { showId: 's3', showName: 'C', kind: 'info', text: 'Item 3', href: '/shows/s3' },
    ]);
    expect(screen.getAllByRole('link')).toHaveLength(3);
  });
});
