import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendMock = vi.hoisted(() => vi.fn());
const infoMock = vi.hoisted(() => vi.fn());

vi.mock('@/components/shows/RegistrationWorkflow/sendRegistrationConfirmationEmail', () => ({
  sendRegistrationConfirmationEmail: sendMock,
}));
vi.mock('@/lib/notifications', () => ({ notifications: { info: infoMock } }));

import {
  CONFIRMATION_EMAIL_FAILED_MESSAGE,
  STAFF_RECEIPT_FAILED_MESSAGE,
  sendSubmittedEntryEmail,
  submittedEntryIdsToEmail,
} from './sendSubmittedEntryEmail';

const created = [
  { dogId: 'd1', classId: 'c1', outcome: 'created', entryId: 'e1' },
  { dogId: 'd2', classId: 'c1', outcome: 'created', entryId: 'e2' },
] as never;

describe('submittedEntryIdsToEmail', () => {
  it('lists every created entry, whoever keyed the submission in', () => {
    expect(submittedEntryIdsToEmail({ createdEntryOutcomes: created })).toEqual(['e1', 'e2']);
  });

  it('is empty when nothing was created', () => {
    expect(submittedEntryIdsToEmail({})).toEqual([]);
  });
});

describe('sendSubmittedEntryEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends with the registration and entry ids and stays quiet on success', async () => {
    sendMock.mockResolvedValue({ ok: true });
    await sendSubmittedEntryEmail('reg-1', ['e1', 'e2']);
    expect(sendMock).toHaveBeenCalledWith('reg-1', ['e1', 'e2']);
    expect(infoMock).not.toHaveBeenCalled();
  });

  it('tells the exhibitor, without throwing, when the send fails or throws', async () => {
    sendMock.mockResolvedValueOnce({ ok: false, error: 'boom' });
    await sendSubmittedEntryEmail('reg-1', ['e1']);
    sendMock.mockRejectedValueOnce(new Error('offline'));
    await sendSubmittedEntryEmail('reg-1', ['e1']);
    expect(infoMock).toHaveBeenCalledTimes(2);
    expect(infoMock).toHaveBeenCalledWith(CONFIRMATION_EMAIL_FAILED_MESSAGE);
  });

  it('tells staff the receipt could not be sent to the exhibitor', async () => {
    sendMock.mockResolvedValueOnce({ ok: false, error: 'No email address for registrant' });
    await sendSubmittedEntryEmail('reg-1', ['e1'], 'secretary_new');
    expect(infoMock).toHaveBeenCalledWith(STAFF_RECEIPT_FAILED_MESSAGE);
  });
});
