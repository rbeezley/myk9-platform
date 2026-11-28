// Copy for the landing page's trust bar, pricing section and FAQ (MYK9-1894, Phase 3).
// Every sentence has a KEEP row in docs/qa/landing-lifecycle-evidence.md ("Trust bar, pricing
// and FAQ"). BANNED_COPY is enforced in landingFacts.test.ts and on the rendered page.
//
// The service fee is never written as a number here. `{fee}` is replaced with the live rate
// read from platform_settings (see feePhrase), the same read /fees makes, so a site admin
// changing the rate cannot leave this page quoting a fee nobody is charged.

type TrustItem = { lead: string; text: string };

// INTENT: no testimonials, club names or logos (owner, 2026-11-12). The club count is the
// owner's own licence-key count, recounted from a fresh export before it ships; under 200 it
// becomes "About 200 clubs".
export const TRUST_ITEMS: readonly TrustItem[] = [
  { lead: 'Since 2013', text: 'RyKris has built scent-sport software.' },
  { lead: 'More than 200 clubs', text: 'run their trials on mySWT and myNWT.' },
  { lead: 'AKC, UKC and ASCA', text: 'Scent Work, Nosework and Scent Detection.' },
  {
    lead: 'No internet needed at the ring',
    text: 'Scores are saved on the device and send themselves later.',
  },
];

/** "a 7% service fee" once the live rate is read; "a service fee" until then, never a guess. */
export function feePhrase(feeLabel: string | null): string {
  return feeLabel ? `a ${feeLabel} service fee` : 'a service fee';
}

/** The exhibitor card's headline: "7% service fee", or "A service fee" until the rate is read. */
export function feeHeadline(feeLabel: string | null): string {
  return feeLabel ? `${feeLabel} service fee` : 'A service fee';
}

export function withFee(text: string, feeLabel: string | null): string {
  return text.split('{fee}').join(feePhrase(feeLabel));
}

// The owner's confirmed wording (2026-11-16), with the figure read live.
export const PRICING_LEDE =
  'Free for clubs, and the club keeps the full entry fee. Exhibitors pay {fee} when they enter online. It covers card processing and keeps myK9Show running.';

/** `price: null` is the service fee, read live (feeHeadline). */
type PricingCard = { who: string; price: string | null; points: readonly string[] };

export const PRICING_CARDS: readonly PricingCard[] = [
  {
    who: 'For clubs',
    price: 'Free',
    points: [
      'No subscription and no charge per entry.',
      'Entry fees paid online are paid out to the club in full.',
    ],
  },
  {
    who: 'For exhibitors',
    price: null,
    points: [
      'Added when you pay by card, and shown before you pay.',
      'Entries paid by check or cash have no service fee.',
      'An account is free.',
    ],
  },
];

export const FEES_LINK = { to: '/fees', label: 'How our fees work' } as const;

type FaqItem = { q: string; a: readonly string[] };

export const FAQ_ITEMS: readonly FaqItem[] = [
  {
    q: 'Does it work with no internet?',
    a: [
      'Scoring at the ring does. Once a show is saved on the judge’s device, scores are kept on that device and send themselves when the internet comes back.',
      'Entering a show, paying by card and signing in need a connection.',
    ],
  },
  {
    q: 'Which registries and sports?',
    a: [
      'This first release is for scent work: AKC Scent Work, UKC Nosework and ASCA Scent Detection.',
      // INTENT: the owner's plan, stated as a plan (2026-11-16). Not a claim about what the app does.
      'Other sports are planned for 2027, among them FAST CAT, obedience, agility and conformation.',
    ],
  },
  {
    q: 'What does it cost?',
    a: [
      'Nothing for the club. Exhibitors pay {fee} when they pay by card. Entries paid by check or cash have no service fee.',
    ],
  },
  {
    q: 'How do results get to the registry?',
    a: [
      // INTENT: says the file is built, not that AKC has received it. Delivery to AKC is not yet
      // confirmed (owner, 2026-11-16); restore the stronger line once it is.
      'For AKC, myK9Show builds the results file in AKC’s format. You can send it to AKC from the app or download it and send it yourself.',
      'For UKC and ASCA it prepares the reports, and you send them the way each registry asks. Anything a registry wants by post is still yours to mail.',
    ],
  },
  {
    q: 'What does switching involve?',
    a: [
      'Create a free account, add your club on this page, and start a draft show straight away. We approve new clubs, usually within a day. To take card payments, the club connects a bank account first.',
      'There is no import from another program, so your first show is set up by hand and mail-in entries are keyed in by you. After that, a new show can start as a copy of an earlier one.',
    ],
  },
  {
    q: 'Can we try it before a real show?',
    a: [
      'Yes. Choose “I’m running a show” above, and the Show day step has a practice scoresheet that works with no account.',
      'An account and a club are free and no card is asked for, so you can build a draft show and look around. A draft is not public.',
    ],
  },
];
