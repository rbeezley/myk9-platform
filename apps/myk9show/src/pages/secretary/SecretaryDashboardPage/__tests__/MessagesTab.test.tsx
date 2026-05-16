import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/test/utils/testUtils';
import { MessagesTab, MESSAGES_TAB_RESERVED_MIN_HEIGHT_PX } from '../MessagesTab';
import type { MessageThread } from '@/features/messages/types';

// Mock the message store
vi.mock('@/store/messageStore', () => ({
  useMessageStore: vi.fn(),
}));

// Mock ThreadDetail to avoid deep dependency chain
vi.mock('@/features/messages/components/ThreadDetail', () => ({
  ThreadDetail: ({ thread }: { thread: MessageThread }) => (
    <div data-testid="thread-detail">{thread.participant_name}</div>
  ),
}));

import { useMessageStore } from '@/store/messageStore';

const mockUseMessageStore = vi.mocked(useMessageStore) as unknown as ReturnType<typeof vi.fn>;

function makeThread(overrides: Partial<MessageThread> = {}): MessageThread {
  return {
    id: 'thread-1',
    show_id: 'show-1',
    participant_id: 'user-1',
    participant_name: 'Jane Doe',
    last_message_at: '2026-04-16T10:00:00Z',
    last_message_preview: 'Looking forward to the trial!',
    unread_count: 0,
    created_at: '2026-04-15T08:00:00Z',
    ...overrides,
  };
}

const shows = [
  { id: 'show-1', name: 'Spring Trial' },
  { id: 'show-2', name: 'Summer Invitational' },
];

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(
    MemoryRouter,
    null,
    React.createElement(QueryClientProvider, { client: createTestQueryClient() }, children)
  );
}

function setupStore(threads: MessageThread[], isLoading = false) {
  mockUseMessageStore.mockImplementation(
    (selector: (s: { threads: MessageThread[]; isLoading: boolean }) => unknown) =>
      selector({ threads, isLoading })
  );
}

describe('MessagesTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders threads with show tags', () => {
    setupStore([makeThread()]);
    render(<MessagesTab shows={shows} />, { wrapper });

    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    // "Spring Trial" appears in both the filter chip and the thread row badge
    expect(screen.getAllByText('Spring Trial').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Looking forward to the trial!')).toBeInTheDocument();
  });

  it('shows unread badge count', () => {
    setupStore([makeThread({ unread_count: 3 })]);
    render(<MessagesTab shows={shows} />, { wrapper });

    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('opens sheet when thread row is clicked', () => {
    setupStore([makeThread()]);
    render(<MessagesTab shows={shows} />, { wrapper });

    fireEvent.click(screen.getByText('Jane Doe').closest('button')!);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByTestId('thread-detail')).toBeInTheDocument();
  });

  it('shows empty state when no threads', () => {
    setupStore([]);
    render(<MessagesTab shows={shows} />, { wrapper });

    expect(screen.getByText('No messages yet.')).toBeInTheDocument();
  });

  it('reserves min-height in the loading skeleton to prevent CLS', () => {
    setupStore([], true);
    render(<MessagesTab shows={shows} />, { wrapper });

    const skeleton = screen.getByTestId('messages-tab-skeleton');
    expect(skeleton).toBeInTheDocument();
    expect(skeleton.style.minHeight).toBe(`${MESSAGES_TAB_RESERVED_MIN_HEIGHT_PX}px`);
    expect(skeleton).toHaveAttribute('aria-busy', 'true');
  });

  it('renders FilterChips in the loading state so they do not pop in later', () => {
    setupStore([], true);
    render(<MessagesTab shows={shows} />, { wrapper });

    // "All Shows" chip should be present alongside the skeleton.
    expect(screen.getByTestId('messages-tab-skeleton')).toBeInTheDocument();
    expect(screen.getByText('All Shows')).toBeInTheDocument();
    expect(
      screen.getAllByText('Spring Trial').some(el => el.closest('[aria-pressed]'))
    ).toBe(true);
  });

  it('does not render skeleton when data is loaded', () => {
    setupStore([makeThread()]);
    render(<MessagesTab shows={shows} />, { wrapper });

    expect(screen.queryByTestId('messages-tab-skeleton')).not.toBeInTheDocument();
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
  });

  it('filters threads by show when chip is clicked', () => {
    setupStore([
      makeThread({ id: 'thread-1', show_id: 'show-1', participant_name: 'Jane Doe' }),
      makeThread({ id: 'thread-2', show_id: 'show-2', participant_name: 'Bob Smith' }),
    ]);
    render(<MessagesTab shows={shows} />, { wrapper });

    // Both visible initially
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('Bob Smith')).toBeInTheDocument();

    // Filter to show-2 only — chip button has aria-pressed, thread badge does not
    const summerChip = screen
      .getAllByText('Summer Invitational')
      .find(el => el.closest('[aria-pressed]'))!;
    fireEvent.click(summerChip.closest('button')!);

    expect(screen.queryByText('Jane Doe')).not.toBeInTheDocument();
    expect(screen.getByText('Bob Smith')).toBeInTheDocument();
  });

  it('shows All Shows chip as selected by default', () => {
    setupStore([]);
    render(<MessagesTab shows={shows} />, { wrapper });

    const allChip = screen.getByText('All Shows');
    expect(allChip.closest('[aria-pressed]')).toHaveAttribute('aria-pressed', 'true');
  });
});
