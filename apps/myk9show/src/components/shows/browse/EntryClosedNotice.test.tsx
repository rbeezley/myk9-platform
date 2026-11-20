import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EntryClosedNotice } from './EntryClosedNotice';
import type { Show } from '@/types/show-types';

const { canEnter, statusOptions } = vi.hoisted(() => ({
  canEnter: vi.fn(),
  statusOptions: vi.fn(),
}));
vi.mock('@/utils/entryStatusUtils', () => ({
  getEntryStatus: (_show: unknown, _entered: unknown, options: unknown) => {
    statusOptions(options);
    return { canEnter: canEnter() };
  },
}));

const show = (id: string, dates: Partial<Show> = {}): Show => ({ id, ...dates }) as Show;

describe('EntryClosedNotice', () => {
  beforeEach(() => {
    canEnter.mockReset();
    statusOptions.mockReset();
  });

  // MYK9-2192: the notice reads the same paused answer as the cards.
  it('asks each show with its paused answer', () => {
    canEnter.mockReturnValue(false);
    render(
      <EntryClosedNotice
        shows={[show('paused'), show('open')]}
        selectedTab="all"
        pausedShowIds={new Set(['paused'])}
      />
    );
    expect(statusOptions).toHaveBeenCalledWith({ cardEntriesPaused: true });
    expect(statusOptions).toHaveBeenCalledWith({ cardEntriesPaused: false });
  });

  it('renders nothing off the "all" tab', () => {
    canEnter.mockReturnValue(false);
    const { container } = render(<EntryClosedNotice shows={[show('a')]} selectedTab="entries" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the list is empty (EmptyState owns that)', () => {
    const { container } = render(<EntryClosedNotice shows={[]} selectedTab="all" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when at least one show can be entered', () => {
    canEnter.mockReturnValueOnce(false).mockReturnValueOnce(true);
    const { container } = render(
      <EntryClosedNotice shows={[show('closed'), show('open')]} selectedTab="all" />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the notice when the list is non-empty but nothing is enterable', () => {
    canEnter.mockReturnValue(false);
    render(<EntryClosedNotice shows={[show('a'), show('b')]} selectedTab="all" />);
    expect(screen.getByText('No shows are open for entries right now')).toBeInTheDocument();
    expect(screen.getByText(/aren’t accepting online entries yet/)).toBeInTheDocument();
  });

  // MYK9-808: a past-month tile keeps its shows visible on purpose (MYK9-427),
  // but "aren't accepting online entries yet ... when its entry window opens"
  // is future-tense wording for a window that has already closed forever
  // (2026-09-26 exhibitor walk, E52).
  it('says entries are closed, not "not yet open", when every show is in the past', () => {
    canEnter.mockReturnValue(false);
    render(
      <EntryClosedNotice
        shows={[show('past', { startDate: '2026-07-25', endDate: '2026-07-27' })]}
        selectedTab="all"
      />
    );
    expect(screen.getByText(/already taken place/)).toBeInTheDocument();
    expect(screen.queryByText(/aren’t accepting online entries yet/)).not.toBeInTheDocument();
  });
});
