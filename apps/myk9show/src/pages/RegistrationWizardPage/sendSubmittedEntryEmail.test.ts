import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendMock = vi.hoisted(() => vi.fn());
const infoMock = vi.hoisted(() => vi.fn());

vi.mock('@/components/shows/RegistrationWorkflow/sendRegistrationConfirmationEmail', () => ({
  sendRegistrationConfirmationEmail: sendMock,
}));
vi.mock('@/lib/notifications', () => ({ notifications: { info: infoMock } }));

import {
  CONFIRMATION_EMAIL_FAILED_MESSAGE,
  sendSubmittedEntryEmail,
  shouldSendSubmittedEntryEmail,
} from './sendSubmittedEntryEmail';

const created = [{ dogId: 'd', classId: 'c' }] as never;

describe('shouldSendSubmittedEntryEmail', () => {
  it('is true only for an exhibitor submission that created an entry', () => {
    expect(
      shouldSendSubmittedEntryEmail('exhibitor', {
        submissionId: 's',
        createdEntryOutcomes: created,
      })
    ).toBe(true);
    expect(
      shouldSendSubmittedEntryEmail('secretary_new', {
        submissionId: 's',
        createdEntryOutcomes: created,
      })
    ).toBe(false);
    expect(shouldSendSubmittedEntryEmail('exhibitor', { submissionId: 's' })).toBe(false);
    expect(shouldSendSubmittedEntryEmail('exhibitor', { createdEntryOutcomes: created })).toBe(
      false
    );
  });
});

describe('sendSubmittedEntryEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends with the registration and submission ids and stays quiet on success', async () => {
    sendMock.mockResolvedValue({ ok: true });
    await sendSubmittedEntryEmail('reg-1', 'sub-1');
    expect(sendMock).toHaveBeenCalledWith('reg-1', 'sub-1');
    expect(infoMock).not.toHaveBeenCalled();
  });

  it('tells the exhibitor, without throwing, when the send fails or throws', async () => {
    sendMock.mockResolvedValueOnce({ ok: false, error: 'boom' });
    await sendSubmittedEntryEmail('reg-1', 'sub-1');
    sendMock.mockRejectedValueOnce(new Error('offline'));
    await sendSubmittedEntryEmail('reg-1', 'sub-1');
    expect(infoMock).toHaveBeenCalledTimes(2);
    expect(infoMock).toHaveBeenCalledWith(CONFIRMATION_EMAIL_FAILED_MESSAGE);
  });
});
