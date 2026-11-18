/**
 * MYK9-1952 phase 1: the premium list prints from one list of facts. This is the parity net:
 * the snapshots were taken from main's output BEFORE the refactor, so a style that gains or
 * drops a fact (or changes its wording) fails here.
 */
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { fromAny } from '@total-typescript/shoehorn';
import { AKCPremiumTemplate } from '../pdf/AKCPremiumTemplate';
import { UKCPremiumTemplate } from '../pdf/UKCPremiumTemplate';
import { STYLE_TOKENS } from '../pdf/pdfStyles';
import type { GeneratedPremium, PremiumStyle } from '@/types/premium-types';
import { STYLED_LANDING_BY_STYLE } from '@/features/_shared/styledLandingRegistry';
import type { Show } from '@/types/show-types';
import type { Trial } from '@/components/trials/types/trial.types';
import { render as renderWithProviders } from '@/test/utils/testUtils';
import { SERVICE_FEE_SENTENCE } from '@/features/payments/withdrawalPolicyText';
import { AKC_PREMIUM_SCOUTING_STATEMENT } from '@/features/registries';

vi.mock('@/hooks/queries/useEntriesDatabase', () => ({
  useEntriesByShowQuery: () => ({ data: [] }),
}));

const ALL_STYLES = Object.keys(STYLE_TOKENS) as PremiumStyle[];
type Org = 'AKC' | 'UKC';

const CLUB_POLICY_TEXT =
  "Full refund until May 15.\nAfter May 15 the club keeps $5.\n\nPulls are at the club's discretion.";

function fullPremium(org: Org, style: PremiumStyle): GeneratedPremium {
  return {
    org,
    style,
    templateId: null,
    show: {
      name: 'Spring Scent Trial',
      startDate: '2026-06-01',
      endDate: '2026-06-02',
      venue: '123 Main St, Tulsa, OK 74101',
      entryOpenDate: '2026-04-01',
      entryCloseDate: '2026-05-15',
      preEntryFee: 20,
      dayOfFee: 25,
      acceptChecks: true,
      acceptCash: true,
      withdrawal: {
        withdrawal_cutoff_date: '2026-05-15',
        withdrawal_retention_type: 'flat',
        withdrawal_retention_value: 500,
        withdrawal_policy_notes: null,
        withdrawal_policy_text: null,
        trials: [{ registry_id: org }],
        clubs: {
          default_withdrawal_retention_type: null,
          default_withdrawal_retention_value: null,
          default_withdrawal_policy_notes: null,
          default_withdrawal_policy_text: CLUB_POLICY_TEXT,
        },
      },
    },
    club: { name: 'Test Club', logoUrl: null },
    secretary: {
      name: 'Jane Smith',
      email: 'jane@test.com',
      phone: '9185550000',
      mailingAddress: '456 Oak Ave',
    },
    officials: { chairman: { name: 'Bob Jones', email: 'bob@test.com', phone: '9185550001' } },
    trials: [
      {
        name: 'Saturday Trial 1',
        date: '2026-06-01',
        startTime: '9:00 AM',
        eventNumber: `${org}-2026-001`,
        type: 'Scent Work',
        judges: [
          { name: 'Alice Judge', residence: 'Springfield, IL', classes: ['Container Novice A'] },
          { name: 'Carl Judge', residence: null, classes: [] },
        ],
        classes: [
          { element: 'Interior', level: 'Advanced', section: null },
          { element: 'Container', level: 'Novice', section: 'A' },
          { element: 'Container', level: 'Excellent', section: null },
        ],
      },
      {
        name: 'Sunday Trial 2',
        date: '2026-06-02',
        startTime: null,
        eventNumber: null,
        type: 'Scent Work',
        judges: [{ name: 'Alice Judge', classes: ['Vehicle Master'] }],
        classes: [{ element: 'Vehicle', level: 'Master', section: null }],
      },
    ],
    supplemental: {
      vetClinic: { name: 'Animal ER', address: '789 Vet Blvd', phone: '9189990000' },
      accommodations: [
        { name: 'La Quinta', address: '100 Hotel Rd', phone: '9181112222' },
        { name: 'Motel 6', address: '200 Inn Rd', phone: '' },
      ],
      coverImageUrl: null,
      hospitalityNotes: 'Lunch on Saturday.',
      awardsDescription: 'Ribbons 1st through 4th.',
      additionalNotes: 'Parking is free.',
    },
    narratives: {
      showHours: 'Building opens at 8:00 AM.',
      trialInformation: 'Novice title required for Advanced.',
    },
  };
}

function sparsePremium(org: Org, style: PremiumStyle): GeneratedPremium {
  return {
    org,
    style,
    templateId: null,
    show: {
      name: 'Bare Show',
      startDate: '2026-06-01',
      endDate: '2026-06-01',
      venue: null,
      entryOpenDate: null,
      entryCloseDate: null,
      preEntryFee: null,
      dayOfFee: null,
      acceptChecks: false,
      acceptCash: false,
    },
    club: { name: null, logoUrl: null },
    secretary: { name: null, email: null, phone: null, mailingAddress: null },
    officials: { chairman: null },
    trials: [],
    supplemental: {
      vetClinic: null,
      accommodations: [],
      coverImageUrl: null,
      hospitalityNotes: null,
      awardsDescription: null,
      additionalNotes: null,
    },
    narratives: { showHours: '', trialInformation: '' },
  };
}

/** Every text node, one per line, so a snapshot diff names the exact fact that moved. */
function pdfText(org: Org, premium: GeneratedPremium, inkSaver = false): string {
  const result = render(
    org === 'AKC' ? (
      <AKCPremiumTemplate premium={premium} inkSaver={inkSaver} />
    ) : (
      <UKCPremiumTemplate premium={premium} inkSaver={inkSaver} />
    )
  );
  const pages = result.getAllByTestId('pdf-page');
  const lines = pages.map((page, i) => {
    const spans = Array.from(page.querySelectorAll('span')).filter(
      span => !span.querySelector('span')
    );
    return [`--- page ${i + 1} ---`, ...spans.map(s => s.textContent ?? '')].join('\n');
  });
  result.unmount();
  return lines.join('\n');
}

describe('premium PDF facts parity (8 styles)', () => {
  it.each(ALL_STYLES)('%s prints the same facts for a full AKC show', style => {
    expect(pdfText('AKC', fullPremium('AKC', style))).toMatchSnapshot();
  });
  it.each(ALL_STYLES)('%s prints the same facts for a full UKC show', style => {
    expect(pdfText('UKC', fullPremium('UKC', style))).toMatchSnapshot();
  });
  it.each(ALL_STYLES)('%s prints the same facts for a show with everything empty', style => {
    expect(pdfText('AKC', sparsePremium('AKC', style))).toMatchSnapshot();
  });
  it.each(ALL_STYLES)('%s prints the same facts with ink saver on', style => {
    expect(pdfText('AKC', fullPremium('AKC', style), true)).toMatchSnapshot();
  });
});

const DANGLING_ENTRY_LABELS = /Opens\s*·\s*Closes|Closes\s*$|Closes\s*·|Entry Closes/m;

describe('premium PDF prints no placeholder for an empty fact (MYK9-2053)', () => {
  it('the dangling-label pattern matches a string that has the dangling label', () => {
    expect('Opens · Closes.').toMatch(DANGLING_ENTRY_LABELS);
    expect('Opens Apr 1 · Closes').toMatch(DANGLING_ENTRY_LABELS);
    expect('Entry Closes\nMay 15').toMatch(DANGLING_ENTRY_LABELS);
    expect('Opens April 1, 2026.').not.toMatch(DANGLING_ENTRY_LABELS);
  });

  it.each(ALL_STYLES)('%s prints no "[REQUIRED" text and no dangling labels when empty', style => {
    for (const org of ['AKC', 'UKC'] as const) {
      const text = pdfText(org, sparsePremium(org, style));
      expect(text).not.toMatch(/REQUIRED/);
      expect(text).not.toMatch(DANGLING_ENTRY_LABELS);
      expect(text).not.toMatch(/Trial Secretary/);
      expect(text).not.toMatch(/Veterinary Services|On-Call Vet/);
    }
  });

  it.each(ALL_STYLES)('%s still prints the entry dates it has', style => {
    const premium = fullPremium('AKC', style);
    const text = pdfText('AKC', {
      ...premium,
      show: { ...premium.show, entryCloseDate: null },
    });
    expect(text).toMatch(/Apr(il)? 1, 2026/);
    expect(text).not.toMatch(DANGLING_ENTRY_LABELS);
  });
});

describe('premium PDF prints the refund and withdrawal policy whole (MYK9-1976)', () => {
  const LONG_TEXT = `${'The club keeps a five dollar office fee after the cutoff. '.repeat(19)}Last line.`;

  it.each(ALL_STYLES)(
    '%s prints the label, the whole text, then the service-fee sentence',
    style => {
      const premium = fullPremium('AKC', style);
      premium.show.withdrawal = { ...premium.show.withdrawal, withdrawal_policy_text: LONG_TEXT };
      const text = pdfText('AKC', premium);
      expect(text).toContain('Withdrawals and Pulls');
      expect(text).toContain(`${LONG_TEXT.trim()}\n\n${SERVICE_FEE_SENTENCE}`);
    }
  );

  it.each(ALL_STYLES)('%s prints the policy on a show with nothing else filled in', style => {
    const premium = sparsePremium('AKC', style);
    premium.show.withdrawal = fullPremium('AKC', style).show.withdrawal;
    const text = pdfText('AKC', premium);
    expect(text).toContain('Withdrawals and Pulls');
    expect(text).toContain(`${CLUB_POLICY_TEXT}\n\n${SERVICE_FEE_SENTENCE}`);
  });
});

describe("premium PDF prints the registry's scouting statement (MYK9-2043)", () => {
  it.each(ALL_STYLES)('%s prints the AKC statement in the regulation’s words', style => {
    const text = pdfText('AKC', fullPremium('AKC', style));
    expect(text).toContain('Scouting the Trial Location');
    expect(text).toContain(AKC_PREMIUM_SCOUTING_STATEMENT);
  });

  it.each(ALL_STYLES)('%s prints it on an AKC show with nothing else filled in', style => {
    expect(pdfText('AKC', sparsePremium('AKC', style))).toContain(AKC_PREMIUM_SCOUTING_STATEMENT);
  });

  it.each(ALL_STYLES)('%s does not print it for a UKC show', style => {
    const text = pdfText('UKC', fullPremium('UKC', style));
    expect(text).not.toContain('Scouting the Trial Location');
    expect(text).not.toMatch(/scout the trial location/);
  });
});

describe("premium PDF prints the club's officers (MYK9-2045)", () => {
  const OFFICERS = [
    { position: 'secretary', name: 'Sam Typed' },
    { position: 'president', name: 'Pat President' },
  ];

  it.each(ALL_STYLES)('%s prints each officer as Title and Name, president first', style => {
    const premium = fullPremium('AKC', style);
    premium.officers = OFFICERS;
    const text = pdfText('AKC', premium);
    expect(text).toContain('Club secretary');
    expect(text).toContain('Sam Typed');
    expect(text).toContain('Pat President');
    expect(text.indexOf('Pat President')).toBeLessThan(text.indexOf('Sam Typed'));
  });

  it.each(ALL_STYLES)('%s prints officers on a show with nothing else filled in', style => {
    const premium = sparsePremium('AKC', style);
    premium.officers = OFFICERS;
    expect(pdfText('AKC', premium)).toContain('Sam Typed');
  });

  it.each(ALL_STYLES)('%s prints no officer titles or placeholder with no officers', style => {
    for (const premium of [fullPremium('AKC', style), sparsePremium('AKC', style)]) {
      const text = pdfText('AKC', premium);
      expect(text).not.toContain('Club secretary');
      expect(text).not.toContain('Club Officers');
      expect(text).not.toContain('President');
    }
  });
});

describe("premium PDF prints the show's Event Committee (MYK9-2064)", () => {
  const COMMITTEE = ['Pat Chair', 'Sam Typed', 'Linda Linked', 'Olive Override', 'Gus Guest'];

  describe.each<Org>(['AKC', 'UKC'])('%s', org => {
    it.each(ALL_STYLES)('%s prints every committee name in order', style => {
      const premium = fullPremium(org, style);
      premium.committee = COMMITTEE;
      const text = pdfText(org, premium);
      expect(text).toContain('Event Committee');
      for (const name of COMMITTEE) expect(text).toContain(name);
      expect(text.indexOf('Pat Chair')).toBeLessThan(text.indexOf('Gus Guest'));
    });

    it.each(ALL_STYLES)('%s prints the committee on a show with nothing else filled in', style => {
      const premium = sparsePremium(org, style);
      premium.committee = COMMITTEE;
      expect(pdfText(org, premium)).toContain('Sam Typed');
    });

    it.each(ALL_STYLES)('%s prints no committee heading or placeholder when empty', style => {
      for (const premium of [fullPremium(org, style), sparsePremium(org, style)]) {
        expect(pdfText(org, premium)).not.toContain('Event Committee');
      }
    });
  });
});

const PUBLISHED_SHOW: Show = fromAny<Show, unknown>({
  id: 'show-1',
  name: 'Spring Scent Trial',
  organization: 'Test Club',
  location: '123 Main St, Tulsa, OK 74101',
  startDate: '2026-06-01',
  endDate: '2026-06-02',
  entryOpenDate: '2026-04-01',
  entryCloseDate: '2030-05-15',
  preEntryFee: '20',
  dayOfShowFee: '25',
  experienceIsPublished: true,
  experiencePublishedStyle: 'monogram',
  experiencePublishedContent: {
    style: 'monogram',
    generatedAt: '2026-04-01T00:00:00Z',
    narratives: {
      showHours: 'Building opens at 8:00 AM.',
      trialInformation: 'Novice title required for Advanced.',
    },
    supplemental: fullPremium('AKC', 'monogram').supplemental,
    outputs: {},
  },
  trials: [
    {
      id: 't1',
      name: 'Saturday Trial 1',
      date: '2026-06-01',
      classes: [
        { id: 'c1', element: 'Interior', level: 'Advanced' },
        { id: 'c2', element: 'Container', level: 'Novice', section: 'A' },
      ],
    },
  ],
});

const TRIAL = fromAny<Trial, unknown>({
  id: 't1',
  name: 'Saturday Trial 1',
  trialNumber: 1,
  trialDate: '2026-06-01',
});

describe('premium public page facts parity (8 styles)', () => {
  // The Headline landing counts down to entry close; freeze the clock so the text is stable.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-05-01T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each(ALL_STYLES)('%s prints the same facts for a published show', style => {
    const Component = STYLED_LANDING_BY_STYLE[style];
    const { container } = renderWithProviders(
      <Component show={PUBLISHED_SHOW} trial={TRIAL} allTrials={[TRIAL]} />
    );
    const text = Array.from(container.querySelectorAll('*'))
      .filter(el => el.children.length === 0)
      .map(el => (el.textContent ?? '').trim())
      .filter(Boolean)
      .join('\n');
    expect(text).toMatchSnapshot();
  });
});

describe('premium PDF prints the registry recording fee (MYK9-2044)', () => {
  const FEE_2027 = {
    registry: 'AKC' as const,
    rates: [{ amountCents: 550, appliesFrom: null }],
    text: 'AKC recording fee: $5.50 per entry',
  };
  const NEW_YEAR_TEXT = 'AKC recording fee: $4.50 per entry; $5.50 per entry from January 1, 2027';
  const NEW_YEAR_FEE = {
    registry: 'AKC' as const,
    rates: [
      { amountCents: 450, appliesFrom: null },
      { amountCents: 550, appliesFrom: '2027-01-01' },
    ],
    text: NEW_YEAR_TEXT,
  };

  it.each(ALL_STYLES)('%s prints the statement generate-premium wrote', style => {
    const premium = fullPremium('AKC', style);
    premium.recordingFee = FEE_2027;
    expect(pdfText('AKC', premium)).toContain('AKC recording fee: $5.50 per entry');
  });

  it.each(ALL_STYLES)('%s prints it on a show with nothing else filled in', style => {
    const premium = sparsePremium('AKC', style);
    premium.recordingFee = {
      ...FEE_2027,
      rates: [{ amountCents: 450, appliesFrom: null }],
      text: 'AKC recording fee: $4.50 per entry',
    };
    expect(pdfText('AKC', premium)).toContain('AKC recording fee: $4.50 per entry');
  });

  it.each(ALL_STYLES)('%s prints both rates for a show across a rate change', style => {
    const premium = fullPremium('AKC', style);
    premium.recordingFee = NEW_YEAR_FEE;
    // react-pdf may wrap the long line; the words, in order, are what the reader sees.
    expect(pdfText('AKC', premium).replace(/\s+/g, ' ')).toContain(NEW_YEAR_TEXT);
  });

  it.each(ALL_STYLES)('%s prints no recording fee line when none was stated', style => {
    const premium = fullPremium('AKC', style);
    premium.recordingFee = null;
    expect(pdfText('AKC', premium)).not.toMatch(/recording fee/i);
    expect(pdfText('AKC', fullPremium('AKC', style))).not.toMatch(/recording fee/i);
  });
});
