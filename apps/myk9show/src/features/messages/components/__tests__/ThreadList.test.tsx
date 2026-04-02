import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { ThreadList } from '../ThreadList';

const threads = [
  {
    id: 'thread-1',
    show_id: 'show-1',
    participant_id: 'user-1',
    last_message_at: '2026-04-01T10:00:00Z',
    created_at: '2026-04-01T09:00:00Z',
    participant_name: 'Alice Handler',
    participant_role: 'Exhibitor',
    unread_count: 2,
    last_message_preview: 'Can I switch my run order?',
  },
  {
    id: 'thread-2',
    show_id: 'show-1',
    participant_id: 'user-2',
    last_message_at: '2026-04-01T09:30:00Z',
    created_at: '2026-04-01T09:00:00Z',
    participant_name: 'Bob Judge',
    participant_role: 'Judge',
    unread_count: 0,
    last_message_preview: 'Ring 2 is ready',
  },
];

describe('ThreadList', () => {
  it('renders all threads', () => {
    render(<ThreadList threads={threads} activeThreadId={null} onSelectThread={vi.fn()} />);
    expect(screen.getByText('Alice Handler')).toBeInTheDocument();
    expect(screen.getByText('Bob Judge')).toBeInTheDocument();
  });

  it('shows unread indicator for threads with unread messages', () => {
    render(<ThreadList threads={threads} activeThreadId={null} onSelectThread={vi.fn()} />);
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('shows message preview', () => {
    render(<ThreadList threads={threads} activeThreadId={null} onSelectThread={vi.fn()} />);
    expect(screen.getByText('Can I switch my run order?')).toBeInTheDocument();
  });

  it('calls onSelectThread when a thread is clicked', async () => {
    const onSelect = vi.fn();
    const { user } = render(
      <ThreadList threads={threads} activeThreadId={null} onSelectThread={onSelect} />
    );
    await user.click(screen.getByText('Alice Handler'));
    expect(onSelect).toHaveBeenCalledWith('thread-1');
  });

  it('highlights the active thread', () => {
    const { container } = render(
      <ThreadList threads={threads} activeThreadId="thread-1" onSelectThread={vi.fn()} />
    );
    expect(container.querySelector('[data-active="true"]')).toBeInTheDocument();
  });

  it('shows empty state when no threads', () => {
    render(<ThreadList threads={[]} activeThreadId={null} onSelectThread={vi.fn()} />);
    expect(screen.getByText(/no conversations/i)).toBeInTheDocument();
  });
});
