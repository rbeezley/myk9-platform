import type { GeneratedPremium } from '@/types/premium-types';

export function generatedPremium(venue = 'Louisville'): GeneratedPremium {
  return {
    org: 'AKC',
    style: 'heritage',
    templateId: null,
    show: {
      name: 'Bluegrass Classic',
      startDate: '2026-05-01',
      endDate: '2026-05-02',
      venue,
      entryOpenDate: null,
      entryCloseDate: null,
      preEntryFee: 25,
      dayOfFee: 30,
      acceptChecks: false,
      acceptCash: false,
    },
    club: { name: 'Bluegrass KC', logoUrl: null },
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
    narratives: { showHours: 'Hours', trialInformation: 'Info' },
  };
}
