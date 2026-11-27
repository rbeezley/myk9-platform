import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { EnrollmentCommunicationSection } from '../EnrollmentCommunicationSection';

vi.mock('@/features/email-delivery-history', () => ({
  ExhibitorEmailHistory: ({ recipientEmail }: { recipientEmail: string }) => (
    <p>History for {recipientEmail}</p>
  ),
}));

function renderSection(exhibitorEmail: string) {
  const onEmail = vi.fn();
  render(
    <EnrollmentCommunicationSection
      lastDecisionEmailedAt={undefined}
      canSendDecisionEmail
      onEmail={onEmail}
      showId="show-1"
      exhibitorEmail={exhibitorEmail}
    />
  );
  return { onEmail };
}

describe('EnrollmentCommunicationSection', () => {
  // MYK9-2483: a mail-in exhibitor with no address was offered a send that could not arrive.
  it.each(['', '   '])('offers no email and says why when no address is on file (%j)', email => {
    renderSection(email);

    expect(screen.queryByRole('button', { name: 'Email Exhibitor' })).not.toBeInTheDocument();
    expect(
      screen.getByText(
        'This exhibitor has no email address on file, so an email cannot reach them. Let them know another way.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/History for/)).not.toBeInTheDocument();
  });

  it('still says why when the decision email is not offered for other reasons', () => {
    render(
      <EnrollmentCommunicationSection
        lastDecisionEmailedAt={undefined}
        canSendDecisionEmail={false}
        onEmail={vi.fn()}
        showId={undefined}
        exhibitorEmail=""
      />
    );

    expect(screen.getByText(/no email address on file/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Email Exhibitor' })).not.toBeInTheDocument();
  });

  it('keeps Email Exhibitor and the delivery history when an address is on file', () => {
    const { onEmail } = renderSection('sally@example.com');

    screen.getByRole('button', { name: 'Email Exhibitor' }).click();
    expect(onEmail).toHaveBeenCalledTimes(1);
    expect(screen.getByText('History for sally@example.com')).toBeInTheDocument();
    expect(screen.queryByText(/no email address on file/)).not.toBeInTheDocument();
  });
});
