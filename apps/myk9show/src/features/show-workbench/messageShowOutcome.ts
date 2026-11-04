import { peopleLabel, type TargetedSendResult } from './messageShowEmail';

export interface SendOutcomeInput {
  /** null means the send request itself errored. */
  result: TargetedSendResult | null;
  /** The in-app copy already exists independent of this call (the announcement post). */
  announcementPosted: boolean;
  emailRequested: boolean;
}

export interface SendOutcome {
  status: 'success' | 'partial' | 'none' | 'request_failed';
  /** Clear the composer and call onSent only when this is true. */
  clear: boolean;
  message: string;
  /** Point the secretary at Email delivery history (an email failed or its status is unknown). */
  showHistoryLink: boolean;
}

function emailsLabel(count: number): string {
  return `${count} ${count === 1 ? 'email' : 'emails'}`;
}

/**
 * The one rule for what a send did, computed per channel (in-app, push, email). Nothing is
 * collapsed into a single "reached" number: an in-app copy is claimed only when one exists,
 * and a failed email attempt never counts as reaching anyone.
 */
export function describeSendOutcome(input: SendOutcomeInput): SendOutcome {
  const { result, announcementPosted, emailRequested } = input;

  if (!result) {
    return announcementPosted
      ? {
          status: 'partial',
          clear: false,
          message: 'Posted in the app. The email did not go out.',
          showHistoryLink: true,
        }
      : {
          status: 'request_failed',
          clear: false,
          message: 'The message could not be sent.',
          showHistoryLink: false,
        };
  }

  const email = emailRequested ? result.email : null;
  const inApp = announcementPosted || result.inboxSent > 0;
  const emailSent = email?.sent ?? 0;
  const emailFailed = email?.failed ?? 0;
  const missing = email?.missing ?? [];
  const missingSentence = missing.length
    ? `No usable email address for ${peopleLabel(missing.length)}: ${missing.join(', ')}.`
    : '';
  const reached = inApp || result.pushSent > 0 || result.peopleReached > 0 || emailSent > 0;

  if (!reached) {
    const parts = ['No one was reached.'];
    if (emailFailed > 0) parts.push(`${emailsLabel(emailFailed)} did not go out.`);
    if (missingSentence) parts.push(missingSentence);
    return {
      status: 'none',
      clear: false,
      message: parts.join(' '),
      showHistoryLink: emailFailed > 0,
    };
  }

  const parts: string[] = [];
  if (inApp) parts.push('Posted in the app.');
  else if (result.pushSent > 0) parts.push('Push alert sent.');
  if (emailRequested) {
    if (!email) {
      parts.push('The email did not go out.');
    } else {
      if (emailSent > 0) parts.push(`Emailed ${peopleLabel(emailSent)}.`);
      if (emailFailed > 0) parts.push(`${emailsLabel(emailFailed)} did not go out.`);
      if (missingSentence) parts.push(missingSentence);
    }
  }
  const emailBroken = emailRequested && (!email || emailFailed > 0);
  return {
    status: emailBroken ? 'partial' : 'success',
    clear: !emailBroken,
    message: parts.join(' '),
    showHistoryLink: emailBroken,
  };
}
