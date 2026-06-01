import { beforeEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import { render, screen } from '@/test/utils/testUtils';
import { MessageShowComposer } from '../MessageShowComposer';

const mockPostAnnouncement = vi.hoisted(() => vi.fn());
const mockSendTargetedMessage = vi.hoisted(() => vi.fn());

vi.mock('../workbenchAnnouncementPost', () => ({
  useWorkbenchAnnouncementPost: () => ({
    postAnnouncement: mockPostAnnouncement,
  }),
}));

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

describe('MessageShowComposer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPostAnnouncement.mockResolvedValue(true);
    mockSendTargetedMessage.mockResolvedValue({ total_recipients: 8 });
  });

  it('sends everyone-in-show messages through announcements, not targeted messaging', async () => {
    const { user } = render(<MessageShowComposer showId="show-1" classes={classes} />);

    await user.click(screen.getByRole('button', { name: 'Results posted' }));
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() => {
      expect(mockPostAnnouncement).toHaveBeenCalledWith(
        expect.objectContaining({
          showId: 'show-1',
          title: 'Results posted',
          content: 'Results have been posted. Please contact the secretary desk with questions.',
          priority: 'normal',
        })
      );
    });
    expect(mockSendTargetedMessage).not.toHaveBeenCalled();
  });

  it('sends push-selected everyone-in-show messages with high announcement priority', async () => {
    const { user } = render(<MessageShowComposer showId="show-1" classes={classes} />);

    await user.click(screen.getByRole('checkbox', { name: 'Send push alert' }));
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() => {
      expect(mockPostAnnouncement).toHaveBeenCalledWith(
        expect.objectContaining({
          priority: 'high',
        })
      );
    });
  });

  it('sends class messages through targeted messaging with the selected class and class label', async () => {
    const { user } = render(<MessageShowComposer showId="show-1" classes={classes} />);

    await user.click(screen.getByRole('combobox', { name: 'Recipient' }));
    await user.click(await screen.findByRole('option', { name: 'A class' }));
    await user.click(screen.getByRole('button', { name: 'Report to gate' }));
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() => {
      expect(mockSendTargetedMessage).toHaveBeenCalledWith(
        'show-1',
        { type: 'class', classId: 'class-1', sendPush: false },
        'Please report to the gate for Container Novice A. We are getting ready for your class.'
      );
    });
    expect(mockPostAnnouncement).not.toHaveBeenCalled();
  });

  it('sends checked-in messages through targeted messaging with custom body', async () => {
    const { user } = render(<MessageShowComposer showId="show-1" classes={classes} />);

    await user.click(screen.getByRole('combobox', { name: 'Recipient' }));
    await user.click(await screen.findByRole('option', { name: 'Everyone checked in' }));
    await user.clear(screen.getByLabelText('Message'));
    await user.type(screen.getByLabelText('Message'), 'Please return your armbands.');
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() => {
      expect(mockSendTargetedMessage).toHaveBeenCalledWith(
        'show-1',
        { type: 'checked_in', sendPush: false },
        'Please return your armbands.'
      );
    });
    expect(mockPostAnnouncement).not.toHaveBeenCalled();
  });

  it('passes sendPush true for targeted messages when push alert is selected', async () => {
    const { user } = render(<MessageShowComposer showId="show-1" classes={classes} />);

    await user.click(screen.getByRole('combobox', { name: 'Recipient' }));
    await user.click(await screen.findByRole('option', { name: 'Everyone checked in' }));
    await user.click(screen.getByRole('checkbox', { name: 'Send push alert' }));
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() => {
      expect(mockSendTargetedMessage).toHaveBeenCalledWith(
        'show-1',
        { type: 'checked_in', sendPush: true },
        expect.any(String)
      );
    });
  });

  it('keeps edited copy when an announcement send fails', async () => {
    mockPostAnnouncement.mockResolvedValueOnce(false);
    const { user } = render(<MessageShowComposer showId="show-1" classes={classes} />);

    await user.clear(screen.getByLabelText('Title'));
    await user.type(screen.getByLabelText('Title'), 'Hold lunch');
    await user.clear(screen.getByLabelText('Message'));
    await user.type(screen.getByLabelText('Message'), 'Lunch will move to noon.');
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() => {
      expect(mockPostAnnouncement).toHaveBeenCalled();
    });
    expect(screen.getByLabelText('Title')).toHaveValue('Hold lunch');
    expect(screen.getByLabelText('Message')).toHaveValue('Lunch will move to noon.');
  });
});
