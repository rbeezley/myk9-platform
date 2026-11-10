import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import type { EntryDecisionEmailJob } from './api';
import { EntryDecisionEmailStatusBadge } from './EntryDecisionEmailStatus';

const entry: EntryManagementEntry = {
  id: 'entry-1',
  registrationId: 'reg-1',
  entryNumber: '1',
  showId: 'show-1',
  dogId: 'dog-1',
  dogName: 'Willow',
  ownerName: 'Jamie Handler',
  ownerEmail: 'jamie@example.com',
  handlerName: 'Jamie Handler',
  classes: [],
  totalFee: 25,
  paidAmount: 25,
  entryStatus: EntryStatus.REJECTED,
  paymentStatus: PaymentStatus.PAID_ONLINE,
  submittedAt: new Date('2026-07-08T12:00:00Z'),
  lastUpdated: new Date('2026-07-08T12:00:00Z'),
};

const sentAcceptedJob: EntryDecisionEmailJob = {
  id: 'job-sent',
  entryId: 'entry-1',
  stepType: 'accepted',
  status: 'sent',
  subject: 'Entry accepted',
  body: 'Accepted body',
  secretaryNote: '',
  dueAt: null,
  preparedAt: '2026-07-08T12:00:00Z',
  sentAt: '2026-07-08T12:05:00Z',
  correctionForJobId: null,
};

describe('EntryDecisionEmailStatusBadge', () => {
  it('opens a saved ready lifecycle email from the entry row', async () => {
    const onReviewReady = vi.fn();
    const { user } = render(
      <EntryDecisionEmailStatusBadge
        entry={entry}
        status={{
          entryId: 'entry-1',
          readyJob: { ...sentAcceptedJob, id: 'job-ready', status: 'ready', sentAt: null },
          sentDecisionJob: null,
          sentCorrectionJob: null,
        }}
        onReviewReady={onReviewReady}
        onPrepareCorrection={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: /email ready/i }));

    expect(onReviewReady).toHaveBeenCalledWith(expect.objectContaining({ id: 'job-ready' }), entry);
  });

  it('offers a correction when the entry decision changed after a sent email', async () => {
    const onPrepareCorrection = vi.fn();
    const { user } = render(
      <EntryDecisionEmailStatusBadge
        entry={entry}
        status={{
          entryId: 'entry-1',
          readyJob: null,
          sentDecisionJob: sentAcceptedJob,
          sentCorrectionJob: null,
        }}
        onReviewReady={vi.fn()}
        onPrepareCorrection={onPrepareCorrection}
      />
    );

    expect(screen.getByText(/acceptance sent/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /prepare correction/i }));

    expect(onPrepareCorrection).toHaveBeenCalledWith(sentAcceptedJob, entry);
  });
});
