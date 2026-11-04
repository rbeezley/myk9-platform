import { beforeEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import { render, screen } from '@/test/utils/testUtils';
import { MessageShowComposer } from '../MessageShowComposer';

const mockSendTargetedMessage = vi.hoisted(() => vi.fn());
const mockEmailAudience = vi.hoisted(() => vi.fn());

vi.mock('../workbenchAnnouncementPost', () => ({
  useWorkbenchAnnouncementPost: () => ({ postAnnouncement: vi.fn() }),
}));
vi.mock('@/features/messages/hooks/useMessageEmailAudience', () => ({
  useMessageEmailAudience: mockEmailAudience,
}));
vi.mock('@/hooks/mutations/useMessageMutations', () => ({
  useMessageMutations: () => ({ sendTargetedMessage: mockSendTargetedMessage, isSending: false }),
}));

const person = { id: 'person-9', name: 'Alice Martin' };

function emailPreview(recipients: number, missing: string[] = []) {
  return { data: { recipients, sent: 0, failed: 0, missing, logFailed: false }, isError: false };
}

describe('MessageShowComposer scoped to one exhibitor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEmailAudience.mockReturnValue(emailPreview(1));
    mockSendTargetedMessage.mockResolvedValue({
      inboxSent: 1,
      pushSent: 0,
      peopleReached: 1,
      email: { recipients: 1, sent: 1, failed: 0, missing: [], logFailed: false },
    });
  });

  it('names the one recipient, has no recipient or class choice, and starts with email on', () => {
    render(<MessageShowComposer showId="show-1" classes={[]} allowEmail person={person} />);

    expect(screen.getByText('Send a message to Alice Martin.')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Recipient' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Class' })).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Also send by email' })).toBeChecked();
    expect(screen.getByText('Will email Alice Martin.')).toBeInTheDocument();
    // A one-person message is a direct message: no show-wide title field.
    expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();
    expect(mockEmailAudience).toHaveBeenLastCalledWith(
      'show-1',
      { type: 'person', personId: 'person-9' },
      true
    );
  });

  it('says plainly when the exhibitor has no email address on file', () => {
    mockEmailAudience.mockReturnValue(emailPreview(0, ['Alice Martin']));
    render(<MessageShowComposer showId="show-1" classes={[]} allowEmail person={person} />);

    expect(
      screen.getByText(
        'Alice Martin has no usable email address on file, so no email will be sent.'
      )
    ).toBeInTheDocument();
  });

  it('sends through the targeted path with exactly that person and email on', async () => {
    const { user } = render(
      <MessageShowComposer showId="show-1" classes={[]} allowEmail person={person} />
    );

    await user.type(screen.getByLabelText('Message'), 'Bring your vet papers');
    await user.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() => {
      expect(mockSendTargetedMessage).toHaveBeenCalledWith(
        'show-1',
        { type: 'person', personId: 'person-9', sendPush: true, sendEmail: true },
        'Bring your vet papers'
      );
    });
    expect(mockSendTargetedMessage).toHaveBeenCalledTimes(1);
  });
});
