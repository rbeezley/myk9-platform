import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { MessageBubble } from '../MessageBubble';

const baseMessage = {
  id: 'msg-1',
  show_id: 'show-1',
  thread_id: 'thread-1',
  sender_id: 'user-2',
  body: 'Hello there!',
  group_label: null,
  read_at: null,
  created_at: '2026-04-01T10:00:00Z',
  sender_name: 'Jane Smith',
  sender_role: 'Secretary',
};

describe('MessageBubble', () => {
  it('renders message body', () => {
    render(<MessageBubble message={baseMessage} isOwnMessage={false} />);
    expect(screen.getByText('Hello there!')).toBeInTheDocument();
  });

  it('shows sender name and role for other messages', () => {
    render(<MessageBubble message={baseMessage} isOwnMessage={false} />);
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    expect(screen.getByText('Secretary')).toBeInTheDocument();
  });

  it('applies own-message styling', () => {
    const { container } = render(<MessageBubble message={baseMessage} isOwnMessage={true} />);
    expect(container.querySelector('[data-own-message="true"]')).toBeInTheDocument();
  });

  it('displays group label when present', () => {
    const msg = { ...baseMessage, group_label: 'Sent to all Class 4 exhibitors' };
    render(<MessageBubble message={msg} isOwnMessage={false} />);
    expect(screen.getByText('Sent to all Class 4 exhibitors')).toBeInTheDocument();
  });

  it('shows formatted timestamp', () => {
    render(<MessageBubble message={baseMessage} isOwnMessage={false} />);
    expect(screen.getByText(/\d{1,2}:\d{2}/)).toBeInTheDocument();
  });
});
