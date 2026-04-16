import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/test/utils/testUtils';
import { EntryDecisionRow } from '../EntryDecisionRow';
import { EntriesTab } from '../EntriesTab';
import type { PendingEntry } from '@/hooks/queries/usePendingEntries';

// Mock the hooks so we control the data
vi.mock('@/hooks/queries/usePendingEntries', () => ({
  usePendingEntries: vi.fn(() => ({ data: [], isLoading: false })),
  PENDING_ENTRIES_KEY: 'pending-entries',
}));

vi.mock('@/hooks/mutations/useEntryDecisionMutations', () => ({
  useEntryDecision: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

import { usePendingEntries } from '@/hooks/queries/usePendingEntries';

function Wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(QueryClientProvider, { client: createTestQueryClient() }, children);
}

const mockEntry: PendingEntry = {
  id: 'entry-1',
  showId: 'show-1',
  showName: 'Spring Trial',
  className: 'Novice A',
  handlerName: 'John Smith',
  dogName: 'Buddy',
  submittedAt: '2026-04-15T10:00:00Z',
};

describe('EntryDecisionRow', () => {
  it('renders handler name, dog name, and class', () => {
    render(<EntryDecisionRow entry={mockEntry} onDecide={vi.fn()} />);
    expect(screen.getByText(/John Smith/)).toBeInTheDocument();
    expect(screen.getByText('Buddy')).toBeInTheDocument();
    expect(screen.getByText('Novice A')).toBeInTheDocument();
  });

  it('calls onDecide with "accepted" when Accept is clicked', () => {
    const onDecide = vi.fn();
    render(<EntryDecisionRow entry={mockEntry} onDecide={onDecide} />);
    fireEvent.click(screen.getByRole('button', { name: /accept/i }));
    expect(onDecide).toHaveBeenCalledWith('entry-1', 'accepted');
  });

  it('calls onDecide with "waitlist" when Waitlist is clicked', () => {
    const onDecide = vi.fn();
    render(<EntryDecisionRow entry={mockEntry} onDecide={onDecide} />);
    fireEvent.click(screen.getByRole('button', { name: /waitlist/i }));
    expect(onDecide).toHaveBeenCalledWith('entry-1', 'waitlist');
  });

  it('calls onDecide with "rejected" when Reject is clicked', () => {
    const onDecide = vi.fn();
    render(<EntryDecisionRow entry={mockEntry} onDecide={onDecide} />);
    fireEvent.click(screen.getByRole('button', { name: /reject/i }));
    expect(onDecide).toHaveBeenCalledWith('entry-1', 'rejected');
  });
});

describe('EntriesTab', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows empty state when no pending entries', () => {
    vi.mocked(usePendingEntries).mockReturnValue({ data: [], isLoading: false } as ReturnType<
      typeof usePendingEntries
    >);
    render(
      <Wrapper>
        <EntriesTab shows={[{ id: 'show-1', name: 'Spring Trial' }]} />
      </Wrapper>
    );
    expect(screen.getByText(/all caught up/i)).toBeInTheDocument();
  });

  it('renders entry rows when entries exist', () => {
    vi.mocked(usePendingEntries).mockReturnValue({
      data: [mockEntry],
      isLoading: false,
    } as ReturnType<typeof usePendingEntries>);
    render(
      <Wrapper>
        <EntriesTab shows={[{ id: 'show-1', name: 'Spring Trial' }]} />
      </Wrapper>
    );
    expect(screen.getByText(/John Smith/)).toBeInTheDocument();
  });
});
