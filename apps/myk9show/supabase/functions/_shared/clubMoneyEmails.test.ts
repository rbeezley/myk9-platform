import { describe, expect, it } from 'vitest';
import {
  bankNeedsAttentionEmail,
  clubPaymentsUrl,
  connectAccountEmail,
  payoutSentEmail,
  payoutsDisabledEmail,
  type ClubMoneyEmail,
} from './clubMoneyEmails';

const CLUB_ID = '9f1c2a7e-0000-4000-8000-000000000001';
const PAYMENTS_URL = clubPaymentsUrl('https://myk9show.com/', CLUB_ID);
const SHOW = { clubName: 'Valley KC', showName: 'Fall Trial 2026', amountCents: 123456 };

const rendered: Array<[string, ClubMoneyEmail]> = [
  ['connect account', connectAccountEmail({ ...SHOW, paymentsUrl: PAYMENTS_URL })],
  ['bank needs attention', bankNeedsAttentionEmail({ ...SHOW, paymentsUrl: PAYMENTS_URL })],
  [
    'payouts disabled',
    payoutsDisabledEmail({ clubName: SHOW.clubName, paymentsUrl: PAYMENTS_URL }),
  ],
  ['payout sent', payoutSentEmail(SHOW)],
];

/** Text a reader sees, plus every attribute value (links included). */
function allText(email: ClubMoneyEmail): string {
  return `${email.subject}\n${email.html}`;
}

describe('club money emails carry no bank details', () => {
  it.each(rendered)('%s: no Stripe account id', (name, email) => {
    expect(allText(email), name).not.toMatch(/acct_/i);
  });

  it.each(rendered)('%s: no account or routing number', (name, email) => {
    const text = allText(email).split(CLUB_ID).join('');
    expect(text, name).not.toMatch(/\d{6,}/);
    expect(text, name).not.toMatch(/(account|routing)\s*(number|no\.?|#)/i);
    expect(text, name).not.toMatch(/\b(ending in|last four|\*{2,}\d{2,})/i);
  });

  it.each(rendered)('%s: no em dash', (name, email) => {
    expect(allText(email), name).not.toContain('—');
  });
});

describe('club money email content', () => {
  it('names the show and the amount where there is one', () => {
    for (const [, email] of rendered.filter(([name]) => name !== 'payouts disabled')) {
      expect(email.html).toContain('Fall Trial 2026');
      expect(email.html).toContain('$1234.56');
    }
  });

  it('a failure the club must fix carries the link that fixes it', () => {
    for (const [name, email] of rendered.filter(([n]) => n !== 'payout sent')) {
      expect(email.html, name).toContain(
        `href="https://myk9show.com/clubs/${CLUB_ID}?tab=payments"`
      );
    }
  });

  it('keeps the existing timing wording for a payout sent', () => {
    expect(payoutSentEmail(SHOW).html).toMatch(/typically arrive within 2 business days/);
    expect(payoutSentEmail(SHOW).subject).toBe('$1234.56 on its way to Valley KC');
  });

  it('escapes names typed by a club', () => {
    const email = payoutSentEmail({ ...SHOW, showName: '<script>x</script>' });
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;');
  });

  it('builds the Payments link from the site URL, defaulting to production', () => {
    expect(clubPaymentsUrl(undefined, 'c1')).toBe('https://myk9show.com/clubs/c1?tab=payments');
    expect(clubPaymentsUrl('http://localhost:5173//', 'c1')).toBe(
      'http://localhost:5173/clubs/c1?tab=payments'
    );
  });
});
