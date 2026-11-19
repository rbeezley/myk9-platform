import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { AKCPremiumTemplate } from '../pdf/AKCPremiumTemplate';
import { UKCPremiumTemplate } from '../pdf/UKCPremiumTemplate';
import { ASCAPremiumTemplate } from '../pdf/ASCAPremiumTemplate';
import { STYLE_TOKENS } from '../pdf/pdfStyles';
import type { GeneratedPremium, PremiumStyle } from '../../../types/premium-types';
import {
  AKC_PREMIUM_SCOUTING_STATEMENT,
  ASCA_PREMIUM_REQUIRED_STATEMENT,
} from '@/features/registries';

type Org = 'AKC' | 'UKC' | 'ASCA';

const ALL_STYLES = Object.keys(STYLE_TOKENS) as PremiumStyle[];
const ORGS: Org[] = ['AKC', 'UKC', 'ASCA'];
const INK_SAVER_STATES: boolean[] = [true, false];

function makePremium(org: Org, style: PremiumStyle): GeneratedPremium {
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
      acceptCash: false,
    },
    club: { name: 'Test Club', logoUrl: null },
    secretary: {
      name: 'Jane Smith',
      email: 'jane@test.com',
      phone: '918-555-0000',
      mailingAddress: '456 Oak Ave',
    },
    officials: { chairman: { name: 'Bob Jones', email: null, phone: null } },
    trials: [
      {
        name: 'Saturday Trial 1',
        date: '2026-06-01',
        startTime: '9:00 AM',
        eventNumber: `${org}-2026-001`,
        type: 'Scent Work',
        judges: [{ name: 'Alice Judge', classes: ['Container'] }],
        classes: [{ element: 'Container', level: 'Novice', section: 'A' }],
      },
    ],
    supplemental: {
      vetClinic: { name: 'Animal ER', address: '789 Vet Blvd', phone: '918-999-0000' },
      accommodations: [{ name: 'La Quinta', address: '100 Hotel Rd', phone: '918-111-2222' }],
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

function renderTemplate(org: Org, premium: GeneratedPremium, inkSaver: boolean) {
  const Template = { AKC: AKCPremiumTemplate, UKC: UKCPremiumTemplate, ASCA: ASCAPremiumTemplate }[
    org
  ];
  return render(<Template premium={premium} inkSaver={inkSaver} />);
}

// 3-deep parametrization: every (style × org × inkSaver) combination must
// render without throwing and produce a non-empty document tree. This is the
// regression net for any future style addition or token change.
const matrix = ALL_STYLES.flatMap(style =>
  ORGS.flatMap(org => INK_SAVER_STATES.map(inkSaver => [style, org, inkSaver] as const))
);

describe('All-styles render matrix (8 styles × 3 orgs × 2 ink-saver states)', () => {
  it.each(matrix)(
    'renders style=%s org=%s inkSaver=%s without throwing',
    (style, org, inkSaver) => {
      const premium = makePremium(org, style);
      let result: ReturnType<typeof renderTemplate> | null = null;
      expect(() => {
        result = renderTemplate(org, premium, inkSaver);
      }).not.toThrow();
      expect(result).not.toBeNull();
      const doc = result!.getByTestId('pdf-document');
      expect(doc).toBeTruthy();
      // Non-empty render: at least one PDF page must exist.
      expect(result!.getAllByTestId('pdf-page').length).toBeGreaterThan(0);
      // Show name should appear somewhere in the rendered tree. Some
      // styles (poster) split the title across multiple Text nodes for
      // typographic effect, so strip whitespace before asserting.
      expect(doc.textContent?.replace(/\s+/g, '')).toContain('SpringScentTrial');
      // MYK9-2043: the AKC scouting statement prints on AKC premiums only.
      const text = doc.textContent?.replace(/\s+/g, '');
      const scouting = AKC_PREMIUM_SCOUTING_STATEMENT.replace(/\s+/g, '');
      if (org === 'AKC') expect(text).toContain(scouting);
      else expect(text).not.toContain(scouting);
      // MYK9-2225: ASCA's §1.5 statements print on ASCA premiums only, in every style.
      const ascaStatement = ASCA_PREMIUM_REQUIRED_STATEMENT.text.replace(/\s+/g, '');
      if (org === 'ASCA') expect(text).toContain(ascaStatement);
      else expect(text).not.toContain(ascaStatement);
    }
  );
});
