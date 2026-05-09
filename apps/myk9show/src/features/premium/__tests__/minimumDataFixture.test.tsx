import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { AKCPremiumTemplate } from '../pdf/AKCPremiumTemplate';
import { UKCPremiumTemplate } from '../pdf/UKCPremiumTemplate';
import { STYLE_TOKENS } from '../pdf/pdfStyles';
import type { GeneratedPremium, PremiumStyle } from '../../../types/premium-types';

type Org = 'AKC' | 'UKC';

const ALL_STYLES = Object.keys(STYLE_TOKENS) as PremiumStyle[];
const ORGS: Org[] = ['AKC', 'UKC'];

// Smallest possible fixture: only show name + dates. Every other field is
// null, zero, or empty. Confirms templates degrade gracefully when an
// exhibitor uses the picker with a freshly created show that has not been
// fleshed out yet.
function makeMinimalPremium(org: Org, style: PremiumStyle): GeneratedPremium {
  return {
    org,
    style,
    templateId: null,
    show: {
      name: 'Bare Minimum Show',
      startDate: '2026-07-01',
      endDate: '2026-07-02',
      venue: '',
      entryOpenDate: null,
      entryCloseDate: null,
      preEntryFee: 0,
      dayOfFee: 0,
      acceptChecks: false,
      acceptCash: false,
    },
    club: { name: '', logoUrl: null },
    secretary: {
      name: null,
      email: null,
      phone: null,
      mailingAddress: null,
    },
    officials: { chairman: null, steward: null },
    trials: [],
    supplemental: {
      vetClinic: null,
      accommodations: [],
      hospitalityNotes: null,
      awardsDescription: null,
      additionalNotes: null,
    },
    narratives: {
      showHours: '',
      trialInformation: '',
    },
  };
}

const matrix = ALL_STYLES.flatMap(style => ORGS.map(org => [style, org] as const));

describe('Minimum-data render matrix (8 styles × 2 orgs)', () => {
  it.each(matrix)(
    'renders style=%s org=%s with only show name + dates without throwing',
    (style, org) => {
      const premium = makeMinimalPremium(org, style);
      let result: ReturnType<typeof render> | null = null;
      expect(() => {
        result =
          org === 'AKC'
            ? render(<AKCPremiumTemplate premium={premium} />)
            : render(<UKCPremiumTemplate premium={premium} />);
      }).not.toThrow();
      expect(result).not.toBeNull();
      const doc = result!.getByTestId('pdf-document');
      expect(doc).toBeTruthy();
      // Poster style splits the title across Text nodes; strip whitespace
      // before asserting so every style passes the same content check.
      expect(doc.textContent?.replace(/\s+/g, '')).toContain('BareMinimumShow');
    }
  );
});
