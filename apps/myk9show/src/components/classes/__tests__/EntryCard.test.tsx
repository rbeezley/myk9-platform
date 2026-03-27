import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { EntryCard, type EntryCardEntry } from '../ClassResultsTable/EntryCard';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

function makeEntry(overrides: Partial<EntryCardEntry> = {}) {
  return {
    entryId: 'entry-1',
    armband: '107',
    dogName: 'Laila',
    dogBreed: 'Scottish Terrier',
    handlerName: 'Kathy Gray',
    status: 'no-status',
    ...overrides,
  };
}

function renderCard(props: Partial<React.ComponentProps<typeof EntryCard>> = {}) {
  const defaultProps = {
    entry: makeEntry(),
    scoringRoute: '/scoring/secretary/classes/class-1/entries/entry-1',
  };
  return render(
    <MemoryRouter>
      <EntryCard {...defaultProps} {...props} />
    </MemoryRouter>
  );
}

describe('EntryCard', () => {
  beforeEach(() => mockNavigate.mockClear());

  it('renders armband number', () => {
    renderCard();
    expect(screen.getByText('107')).toBeInTheDocument();
  });

  it('renders dog name', () => {
    renderCard();
    expect(screen.getByText('Laila')).toBeInTheDocument();
  });

  it('renders breed', () => {
    renderCard();
    expect(screen.getByText('Scottish Terrier')).toBeInTheDocument();
  });

  it('renders handler name with prefix', () => {
    renderCard();
    expect(screen.getByText(/Handler:.*Kathy Gray/)).toBeInTheDocument();
  });

  it('renders status badge with label', () => {
    renderCard({ entry: makeEntry({ status: 'checked-in' }) });
    expect(screen.getByText(/Checked-in/)).toBeInTheDocument();
  });

  it('renders "No Status" badge by default', () => {
    renderCard();
    expect(screen.getByText('No Status')).toBeInTheDocument();
  });

  it('navigates to scoring route on click', async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole('button'));
    expect(mockNavigate).toHaveBeenCalledWith('/scoring/secretary/classes/class-1/entries/entry-1');
  });

  it('renders come-to-gate badge with primary color', () => {
    renderCard({
      entry: makeEntry({ status: 'come-to-gate' }),
    });
    const badge = screen.getByText(/Come to Gate/);
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('bg-primary');
  });

  it('shows -- for missing armband', () => {
    renderCard({ entry: makeEntry({ armband: '' }) });
    expect(screen.getByText('--')).toBeInTheDocument();
  });

  // Verify card is a focusable button for keyboard accessibility
  it('renders as a button element for keyboard access', () => {
    renderCard();
    expect(screen.getByRole('button')).toBeInTheDocument();
  });
});
