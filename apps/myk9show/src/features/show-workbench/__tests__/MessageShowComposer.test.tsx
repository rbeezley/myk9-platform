import { beforeEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import { render, screen } from '@/test/utils/testUtils';
import { MessageShowComposer } from '../MessageShowComposer';

const mockPostAnnouncement = vi.hoisted(() => vi.fn());
const mockSendTargetedMessage = vi.hoisted(() => vi.fn());
const mockMessageMutationState = vi.hoisted(() => ({ isSending: false }));

vi.mock('../workbenchAnnouncementPost', () => ({
  useWorkbenchAnnouncementPost: () => ({
    postAnnouncement: mockPostAnnouncement,
  }),
}));

vi.mock('@/hooks/mutations/useMessageMutations', () => ({
  useMessageMutations: () => ({
    sendTargetedMessage: mockSendTargetedMessage,
    isSending: mockMessageMutationState.isSending,
  }),
}));

const classes = [
  { id: 'class-1', label: 'Container Novice A', entryCount: 8 },
  { id: 'class-2', label: 'Interior Advanced', entryCount: 12 },
];

describe('MessageShowComposer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMessageMutationState.isSending = false;
    mockPostAnnouncement.mockResolvedValue(true);
    mockSendTargetedMessage.mockResolvedValue({ total_recipients: 8 });
  });

  it('describes everyone-in-show as a show message, not an announcement choice', async () => {
    const { user } = render(<MessageShowComposer showId="show-1" classes={classes} />);

    expect(screen.getByText('Send a show message to everyone or a targeted group.')).toBeInTheDocument();
    expect(screen.queryByText(/announcement/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('Lunch is ready');

    await user.click(screen.getByRole('combobox', { name: 'Recipient' }));
    await user.click(await screen.findByRole('option', { name: 'A class' }));
    expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: 'Recipient' }));
    await user.click(await screen.findByRole('option', { name: 'Everyone in show' }));
    expect(screen.getByLabelText('Title')).toHaveValue('Lunch is ready');
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
          priority: 'high',
        })
      );
    });
    expect(mockSendTargetedMessage).not.toHaveBeenCalled();
  });

  it('can limit a show-wide sender to the everyone-in-show lane', async () => {
    const { user } = render(
      <MessageShowComposer showId="show-1" classes={classes} allowedRecipients={['all_show']} />
    );

    await user.click(screen.getByRole('combobox', { name: 'Recipient' }));

    expect(await screen.findByRole('option', { name: 'Everyone in show' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'A class' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Everyone checked in' })).not.toBeInTheDocument();
  });

  it('can send everyone-in-show through targeted messaging when the caller cannot post show-wide posts', async () => {
    const { user } = render(
      <MessageShowComposer
        showId="show-1"
        classes={classes}
        showWideDeliveryLane="targeted"
      />
    );

    await user.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() => {
      expect(mockSendTargetedMessage).toHaveBeenCalledWith(
        'show-1',
        { type: 'all_show', sendPush: true },
        'Lunch is ready for judges, stewards, and volunteers. Please check in at hospitality.'
      );
    });
    expect(mockPostAnnouncement).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();
  });

  it('sends quiet everyone-in-show messages with normal priority when push is unchecked', async () => {
    const { user } = render(<MessageShowComposer showId="show-1" classes={classes} />);

    await user.click(screen.getByRole('checkbox', { name: 'Send push alert' }));
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() => {
      expect(mockPostAnnouncement).toHaveBeenCalledWith(
        expect.objectContaining({
          priority: 'normal',
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
        { type: 'class', classId: 'class-1', sendPush: true },
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
        { type: 'checked_in', sendPush: true },
        'Please return your armbands.'
      );
    });
    expect(mockPostAnnouncement).not.toHaveBeenCalled();
  });

  it('hides the title field for checked-in targeted messages', async () => {
    const { user } = render(<MessageShowComposer showId="show-1" classes={classes} />);

    await user.click(screen.getByRole('combobox', { name: 'Recipient' }));
    await user.click(await screen.findByRole('option', { name: 'Everyone checked in' }));

    expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();
  });

  it('passes sendPush false for targeted messages when push alert is unchecked', async () => {
    const { user } = render(<MessageShowComposer showId="show-1" classes={classes} />);

    await user.click(screen.getByRole('combobox', { name: 'Recipient' }));
    await user.click(await screen.findByRole('option', { name: 'Everyone checked in' }));
    await user.click(screen.getByRole('checkbox', { name: 'Send push alert' }));
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() => {
      expect(mockSendTargetedMessage).toHaveBeenCalledWith(
        'show-1',
        { type: 'checked_in', sendPush: false },
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

  it('disables reset while a send is in flight', () => {
    mockMessageMutationState.isSending = true;

    render(<MessageShowComposer showId="show-1" classes={classes} />);

    expect(screen.getByRole('button', { name: 'Reset' })).toBeDisabled();
  });

  it('shows human-readable recipient label on initial render (not raw enum)', () => {
    render(<MessageShowComposer showId="show-1" classes={classes} />);

    // Trigger should show label, not raw value 'all_show'
    expect(screen.getByRole('combobox', { name: 'Recipient' })).toHaveTextContent(
      'Everyone in show'
    );
  });

  it('shows class label with entry count on first render (not UUID)', async () => {
    const { user } = render(<MessageShowComposer showId="show-1" classes={classes} />);

    await user.click(screen.getByRole('combobox', { name: 'Recipient' }));
    await user.click(await screen.findByRole('option', { name: 'A class' }));

    // Class trigger should show label + count, not UUID
    const classTrigger = screen.getByRole('combobox', { name: 'Class' });
    expect(classTrigger).toHaveTextContent('Container Novice A · 8 entries');
    expect(classTrigger).not.toHaveTextContent('class-1');
  });
});
