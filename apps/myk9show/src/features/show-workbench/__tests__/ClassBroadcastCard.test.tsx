import { beforeEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import { render, screen } from '@/test/utils/testUtils';
import { ClassBroadcastCard } from '../ClassBroadcastCard';

const mockSendTargetedMessage = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/mutations/useMessageMutations', () => ({
  useMessageMutations: () => ({
    sendTargetedMessage: mockSendTargetedMessage,
    isSending: false,
  }),
}));

const classes = [
  { id: 'class-1', label: 'Container Novice A', entryCount: 8 },
  { id: 'class-2', label: 'Interior Advanced', entryCount: 12 },
];

describe('ClassBroadcastCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendTargetedMessage.mockResolvedValue({ sent_to: 8 });
  });

  it('loads a canned class message for the first class', () => {
    render(<ClassBroadcastCard showId="show-1" classes={classes} />);

    expect(screen.getByRole('heading', { name: 'Message a class' })).toBeInTheDocument();
    expect(screen.getByLabelText('Message')).toHaveValue(
      'Please report to the gate for Container Novice A. We are getting ready for your class.'
    );
    expect(screen.getByText('8 entries')).toBeInTheDocument();
  });

  it('sends the edited class message through targeted messaging', async () => {
    const { user } = render(<ClassBroadcastCard showId="show-1" classes={classes} />);

    await user.click(screen.getByRole('button', { name: 'Class delayed' }));
    await user.clear(screen.getByLabelText('Message'));
    await user.type(screen.getByLabelText('Message'), 'Container Novice A will restart at 1:30.');
    await user.click(screen.getByRole('button', { name: 'Send class message' }));

    await waitFor(() => {
      expect(mockSendTargetedMessage).toHaveBeenCalledWith(
        'show-1',
        { type: 'class', classId: 'class-1' },
        'Container Novice A will restart at 1:30.'
      );
    });
  });

  it('sends to the selected class', async () => {
    const { user } = render(<ClassBroadcastCard showId="show-1" classes={classes} />);

    await user.click(screen.getByRole('combobox', { name: 'Class' }));
    await user.click(await screen.findByRole('option', { name: /Interior Advanced/ }));
    await user.click(screen.getByRole('button', { name: 'Class delayed' }));
    await user.click(screen.getByRole('button', { name: 'Send class message' }));

    await waitFor(() => {
      expect(mockSendTargetedMessage).toHaveBeenCalledWith(
        'show-1',
        { type: 'class', classId: 'class-2' },
        'Interior Advanced is running later than posted. Please stay nearby and listen for updates.'
      );
    });
  });

  it('disables sending when no classes are loaded', () => {
    render(<ClassBroadcastCard showId="show-1" classes={[]} />);

    expect(screen.getByText('No classes loaded')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send class message' })).toBeDisabled();
  });

  it('does not send to an empty class', async () => {
    const { user } = render(
      <ClassBroadcastCard
        showId="show-1"
        classes={[{ id: 'class-3', label: 'Exterior Novice', entryCount: 0 }]}
      />
    );

    expect(screen.getByText('No exhibitors entered yet — nothing to deliver.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Send class message' }));

    expect(mockSendTargetedMessage).not.toHaveBeenCalled();
  });

  it('keeps edited copy when targeted send fails', async () => {
    mockSendTargetedMessage.mockResolvedValueOnce(null);
    const { user } = render(<ClassBroadcastCard showId="show-1" classes={classes} />);

    await user.clear(screen.getByLabelText('Message'));
    await user.type(screen.getByLabelText('Message'), 'Please hold near the gate.');
    await user.click(screen.getByRole('button', { name: 'Send class message' }));

    await waitFor(() => {
      expect(mockSendTargetedMessage).toHaveBeenCalled();
    });
    expect(screen.getByLabelText('Message')).toHaveValue('Please hold near the gate.');
  });
});
