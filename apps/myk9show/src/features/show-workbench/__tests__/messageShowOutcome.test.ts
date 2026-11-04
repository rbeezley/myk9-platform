import { describe, expect, it } from 'vitest';
import type { TargetedSendResult } from '../messageShowEmail';
import { parseTargetedSendResult } from '../messageShowEmail';
import { describeSendOutcome } from '../messageShowOutcome';

const email = (
  over: Partial<NonNullable<TargetedSendResult['email']>> = {}
): NonNullable<TargetedSendResult['email']> => ({
  recipients: 0,
  sent: 0,
  failed: 0,
  missing: [],
  logFailed: false,
  ...over,
});

const result = (over: Partial<TargetedSendResult> = {}): TargetedSendResult => ({
  inboxSent: 0,
  pushSent: 0,
  peopleReached: 0,
  email: null,
  ...over,
});

describe('describeSendOutcome', () => {
  it.each([
    {
      name: 'empty checked-in audience with email on',
      input: {
        result: result({ email: email() }),
        announcementPosted: false,
        emailRequested: true,
      },
      status: 'none',
      clear: false,
      message: 'No one was reached.',
      link: false,
    },
    {
      name: 'empty audience, everyone lacks an address',
      input: {
        result: result({ email: email({ missing: ['Una Smith'] }) }),
        announcementPosted: false,
        emailRequested: true,
      },
      status: 'none',
      clear: false,
      message: 'No one was reached. No usable email address for 1 person: Una Smith.',
      link: false,
    },
    {
      name: 'all unlinked exhibitors and the email fails',
      input: {
        result: result({ email: email({ recipients: 1, failed: 1 }) }),
        announcementPosted: false,
        emailRequested: true,
      },
      status: 'none',
      clear: false,
      message: 'No one was reached. 1 email did not go out.',
      link: true,
    },
    {
      name: 'all unlinked exhibitors and the email succeeds',
      input: {
        result: result({ peopleReached: 2, email: email({ recipients: 2, sent: 2 }) }),
        announcementPosted: false,
        emailRequested: true,
      },
      status: 'success',
      clear: true,
      message: 'Emailed 2 people.',
      link: false,
    },
    {
      name: 'linked exhibitors and the email partly fails',
      input: {
        result: result({
          inboxSent: 5,
          peopleReached: 5,
          email: email({ recipients: 5, sent: 3, failed: 2 }),
        }),
        announcementPosted: false,
        emailRequested: true,
      },
      status: 'partial',
      clear: false,
      message: 'Posted in the app. Emailed 3 people. 2 emails did not go out.',
      link: true,
    },
    {
      name: 'announcement posted and the email request errors',
      input: { result: null, announcementPosted: true, emailRequested: true },
      status: 'partial',
      clear: false,
      message: 'Posted in the app. The email did not go out.',
      link: true,
    },
    {
      name: 'announcement posted and the email succeeds',
      input: {
        result: result({ peopleReached: 3, email: email({ recipients: 3, sent: 3 }) }),
        announcementPosted: true,
        emailRequested: true,
      },
      status: 'success',
      clear: true,
      message: 'Posted in the app. Emailed 3 people.',
      link: false,
    },
    {
      name: 'push-only success',
      input: { result: result({ pushSent: 3 }), announcementPosted: false, emailRequested: false },
      status: 'success',
      clear: true,
      message: 'Push alert sent.',
      link: false,
    },
    {
      name: 'inbox send with no email',
      input: {
        result: result({ inboxSent: 4, peopleReached: 4 }),
        announcementPosted: false,
        emailRequested: false,
      },
      status: 'success',
      clear: true,
      message: 'Posted in the app.',
      link: false,
    },
    {
      name: 'request error with no in-app copy',
      input: { result: null, announcementPosted: false, emailRequested: false },
      status: 'request_failed',
      clear: false,
      message: 'The message could not be sent.',
      link: false,
    },
  ])('$name', ({ input, status, clear, message, link }) => {
    const outcome = describeSendOutcome(input);
    expect(outcome).toEqual({ status, clear, message, showHistoryLink: link });
  });

  it('reports a legacy-only response (function older than the client) as a success', () => {
    const legacy = parseTargetedSendResult({ sent_to: 4, total_recipients: 5, push_sent: 0 });
    expect(legacy).toEqual({ inboxSent: 4, pushSent: 0, peopleReached: 5, email: null });
    expect(
      describeSendOutcome({ result: legacy, announcementPosted: false, emailRequested: false })
    ).toEqual({
      status: 'success',
      clear: true,
      message: 'Posted in the app.',
      showHistoryLink: false,
    });
  });

  it('prefers the per-channel fields when both shapes are present', () => {
    expect(
      parseTargetedSendResult({
        inbox_sent: 0,
        people_reached: 0,
        sent_to: 0,
        total_recipients: 0,
        push_sent: 2,
      })
    ).toMatchObject({ inboxSent: 0, peopleReached: 0, pushSent: 2 });
    expect(
      parseTargetedSendResult({ inbox_sent: 3, people_reached: 3, sent_to: 9, total_recipients: 9 })
    ).toMatchObject({ inboxSent: 3, peopleReached: 3 });
  });
});
