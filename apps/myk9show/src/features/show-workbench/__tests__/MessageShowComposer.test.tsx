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

const mockEmailAudience = vi.hoisted(() => vi.fn());

vi.mock('@/features/messages/hooks/useMessageEmailAudience', () => ({
  useMessageEmailAudience: mockEmailAudience,
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
    mockEmailAudience.mockReturnValue({
      data: { recipients: 5, sent: 0, failed: 0, missing: ['Bob Smith'] },
      isError: false,
    });
    mockSendTargetedMessage.mockResolvedValue({
      inboxSent: 8,
      pushSent: 0,
      peopleReached: 8,
      email: null,
    });
  });

  it('describes everyone-in-show as a show message, not an announcement choice', async () => {
    const { user } = render(<MessageShowComposer showId="show-1" classes={classes} />);

    expect(
      screen.getByText('Send a show message to everyone or a targeted group.')
    ).toBeInTheDocument();
    expect(screen.queryByText(/announcement/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('');

    await user.click(screen.getByRole('combobox', { name: 'Recipient' }));
    await user.click(await screen.findByRole('option', { name: 'A class' }));
    expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: 'Recipient' }));
    await user.click(await screen.findByRole('option', { name: 'Everyone in show' }));
    expect(screen.getByLabelText('Title')).toHaveValue('');
  });

  it('opens empty with no template selected and Send disabled, so pressing Send sends nothing', async () => {
    const { user } = render(<MessageShowComposer showId="show-1" classes={classes} />);

    expect(screen.getByLabelText('Title')).toHaveValue('');
    expect(screen.getByLabelText('Message')).toHaveValue('');
    const send = screen.getByRole('button', { name: 'Send message' });
    expect(send).toBeDisabled();
    expect(send).toHaveAccessibleDescription('Add a title and message to send.');
    await user.click(send);
    expect(mockPostAnnouncement).not.toHaveBeenCalled();
    expect(mockSendTargetedMessage).not.toHaveBeenCalled();
  });

  it('places Send after the message field and enables it once title and message exist', async () => {
    const { user } = render(<MessageShowComposer showId="show-1" classes={classes} />);

    const message = screen.getByLabelText('Message');
    const send = screen.getByRole('button', { name: 'Send message' });
    expect(message.compareDocumentPosition(send) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await user.type(screen.getByLabelText('Title'), 'Hi');
    expect(send).toBeDisabled();
    await user.type(message, 'x');
    expect(send).toBeEnabled();
    expect(screen.queryByText('Add a title and message to send.')).not.toBeInTheDocument();
  });

  it('changing the class with no template chosen writes no template copy', async () => {
    const { user } = render(<MessageShowComposer showId="show-1" classes={classes} />);

    await user.click(screen.getByRole('combobox', { name: 'Recipient' }));
    await user.click(await screen.findByRole('option', { name: 'A class' }));
    await user.click(screen.getByRole('combobox', { name: 'Class' }));
    await user.click(await screen.findByRole('option', { name: /Interior Advanced/ }));

    expect(screen.getByLabelText('Message')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Send message' })).toHaveAccessibleDescription(
      'Write a message to send.'
    );
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
      <MessageShowComposer showId="show-1" classes={classes} showWideDeliveryLane="targeted" />
    );

    await user.click(screen.getByRole('button', { name: 'Lunch ready' }));
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

    await user.click(screen.getByRole('button', { name: 'Lunch ready' }));
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
    await user.type(screen.getByLabelText('Message'), 'Quiet note');
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

  describe('Also send by email', () => {
    it('is not offered unless the caller allows it', () => {
      render(<MessageShowComposer showId="show-1" classes={classes} />);

      expect(
        screen.queryByRole('checkbox', { name: 'Also send by email' })
      ).not.toBeInTheDocument();
    });

    it('states who will get the email, by count and audience, before Send', async () => {
      const { user } = render(<MessageShowComposer showId="show-1" classes={classes} allowEmail />);

      expect(screen.queryByText(/Will also email/)).not.toBeInTheDocument();
      await user.click(screen.getByRole('checkbox', { name: 'Also send by email' }));

      expect(
        screen.getByText(
          'Will also email 5 people in everyone in the show. No usable email address on file for 1 person: Bob Smith.'
        )
      ).toBeInTheDocument();
      expect(mockEmailAudience).toHaveBeenLastCalledWith('show-1', { type: 'all_show' }, true);
    });

    it('sends the email option with the class audience through the targeted path', async () => {
      const { user } = render(
        <MessageShowComposer
          showId="show-1"
          classes={classes}
          allowEmail
          allowedRecipients={['class']}
        />
      );

      await user.click(screen.getByRole('checkbox', { name: 'Also send by email' }));
      await user.type(screen.getByLabelText('Message'), 'Venue changed');
      await user.click(screen.getByRole('button', { name: 'Send message' }));

      await waitFor(() => {
        expect(mockSendTargetedMessage).toHaveBeenCalledWith(
          'show-1',
          { type: 'class', classId: 'class-1', sendPush: true, sendEmail: true },
          'Venue changed'
        );
      });
      expect(mockEmailAudience).toHaveBeenCalledWith(
        'show-1',
        { type: 'class', classId: 'class-1' },
        true
      );
    });

    it('mails a show-wide announcement through an email-only send, not a second inbox copy', async () => {
      const { user } = render(<MessageShowComposer showId="show-1" classes={classes} allowEmail />);

      await user.click(screen.getByRole('checkbox', { name: 'Also send by email' }));
      await user.type(screen.getByLabelText('Title'), 'Venue changed');
      await user.type(screen.getByLabelText('Message'), 'We moved to Hall B');
      await user.click(screen.getByRole('button', { name: 'Send message' }));

      await waitFor(() => {
        expect(mockSendTargetedMessage).toHaveBeenCalledWith(
          'show-1',
          { type: 'all_show', sendPush: false, emailOnly: true },
          'We moved to Hall B'
        );
      });
      expect(mockPostAnnouncement).toHaveBeenCalledTimes(1);
    });

    const emailResult = (failed: number) => ({
      inboxSent: 4,
      pushSent: 0,
      peopleReached: 4,
      email: { recipients: 4, sent: 4 - failed, failed, missing: [], logFailed: false },
    });

    it('keeps the text and shows a plain result when the announcement email request errors', async () => {
      mockSendTargetedMessage.mockResolvedValueOnce(null);
      const { user } = render(<MessageShowComposer showId="show-1" classes={classes} allowEmail />);

      await user.click(screen.getByRole('checkbox', { name: 'Also send by email' }));
      await user.type(screen.getByLabelText('Title'), 'Venue changed');
      await user.type(screen.getByLabelText('Message'), 'We moved to Hall B');
      await user.click(screen.getByRole('button', { name: 'Send message' }));

      expect(await screen.findByText(/Posted in the app. The email did not go out./)).toBeVisible();
      expect(screen.getByLabelText('Message')).toHaveValue('We moved to Hall B');
      expect(screen.getByRole('link', { name: 'See Email delivery history' })).toHaveAttribute(
        'href',
        '/secretary/messages?showId=show-1&view=email'
      );
      expect(screen.queryByRole('button', { name: /again/i })).not.toBeInTheDocument();
      expect(mockSendTargetedMessage).toHaveBeenCalledTimes(1);
      expect(mockPostAnnouncement).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: 'Send message' })).toBeEnabled();
    });

    it('keeps the text and counts failed emails on a targeted send, and Reset clears the result', async () => {
      mockSendTargetedMessage.mockResolvedValueOnce(emailResult(2));
      const { user } = render(
        <MessageShowComposer
          showId="show-1"
          classes={classes}
          allowEmail
          allowedRecipients={['checked_in']}
        />
      );

      await user.click(screen.getByRole('checkbox', { name: 'Also send by email' }));
      await user.type(screen.getByLabelText('Message'), 'Gate moved');
      await user.click(screen.getByRole('button', { name: 'Send message' }));

      expect(
        await screen.findByText(/Posted in the app. Emailed 2 people. 2 emails did not go out./)
      ).toBeVisible();
      expect(screen.getByLabelText('Message')).toHaveValue('Gate moved');

      await user.click(screen.getByRole('button', { name: 'Reset' }));

      expect(screen.queryByText(/did not go out/)).not.toBeInTheDocument();
      expect(screen.getByLabelText('Message')).toHaveValue('');
    });

    it('keeps the text and never calls onSent when no one was reached', async () => {
      mockSendTargetedMessage.mockResolvedValueOnce({
        inboxSent: 0,
        pushSent: 0,
        peopleReached: 0,
        email: { recipients: 0, sent: 0, failed: 0, missing: [], logFailed: false },
      });
      const onSent = vi.fn();
      const { user } = render(
        <MessageShowComposer
          showId="show-1"
          classes={classes}
          allowEmail
          onSent={onSent}
          allowedRecipients={['checked_in']}
        />
      );

      await user.click(screen.getByRole('checkbox', { name: 'Also send by email' }));
      await user.type(screen.getByLabelText('Message'), 'Gate moved');
      await user.click(screen.getByRole('button', { name: 'Send message' }));

      expect(await screen.findByText(/No one was reached\./)).toBeVisible();
      expect(screen.getByLabelText('Message')).toHaveValue('Gate moved');
      expect(screen.queryByText(/Posted in the app/)).not.toBeInTheDocument();
      expect(onSent).not.toHaveBeenCalled();
    });

    it('clears the form when every email went out', async () => {
      mockSendTargetedMessage.mockResolvedValueOnce(emailResult(0));
      const { user } = render(
        <MessageShowComposer
          showId="show-1"
          classes={classes}
          allowEmail
          allowedRecipients={['checked_in']}
        />
      );

      await user.click(screen.getByRole('checkbox', { name: 'Also send by email' }));
      await user.type(screen.getByLabelText('Message'), 'Gate moved');
      await user.click(screen.getByRole('button', { name: 'Send message' }));

      await waitFor(() => expect(screen.getByLabelText('Message')).toHaveValue(''));
      expect(screen.queryByText(/did not go out/)).not.toBeInTheDocument();
    });

    it('does not send email when the option stays off', async () => {
      const { user } = render(<MessageShowComposer showId="show-1" classes={classes} allowEmail />);

      await user.type(screen.getByLabelText('Title'), 'Hi');
      await user.type(screen.getByLabelText('Message'), 'x');
      await user.click(screen.getByRole('button', { name: 'Send message' }));

      await waitFor(() => expect(mockPostAnnouncement).toHaveBeenCalled());
      expect(mockSendTargetedMessage).not.toHaveBeenCalled();
    });
  });
});
