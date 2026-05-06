import { describe, it, expect } from 'vitest';
import { computePremiumDiff } from '../logPremiumGeneration';
import type { GeneratedPremium, PremiumSupplemental } from '../../../types/premium-types';

const makeSupplemental = (overrides: Partial<PremiumSupplemental> = {}): PremiumSupplemental => ({
  vetClinic: { name: 'Riverside Vet', address: '123 Main St', phone: '555-0100' },
  accommodations: [],
  hospitalityNotes: null,
  awardsDescription: null,
  additionalNotes: null,
  ...overrides,
});

const makeOriginal = (
  supplemental: PremiumSupplemental = makeSupplemental()
): GeneratedPremium => ({
  org: 'AKC',
  style: 'monogram',
  templateId: 'tmpl-1',
  show: {
    name: 'Test Show',
    startDate: '2026-06-01',
    endDate: '2026-06-02',
    venue: 'Fairgrounds',
    entryOpenDate: null,
    entryCloseDate: null,
    preEntryFee: 25,
    dayOfFee: 30,
    acceptChecks: true,
    acceptCash: false,
  },
  club: { name: 'Test Club', logoUrl: null },
  secretary: { name: null, email: null, phone: null, mailingAddress: null },
  officials: { chairman: null, steward: null },
  trials: [],
  supplemental,
  narratives: {
    showHours: 'Show opens at 8am.',
    trialInformation: 'This is a scent work trial.',
  },
});

describe('computePremiumDiff', () => {
  it('returns empty diffs when nothing changed', () => {
    const original = makeOriginal();
    const diff = computePremiumDiff(
      original,
      original.supplemental,
      original.narratives,
      original.style
    );
    expect(diff.fieldOverrides).toEqual({});
    expect(diff.narrativeEdits).toEqual({});
  });

  it('records vet_clinic override when vetClinic changes', () => {
    const original = makeOriginal();
    const finalSupplemental = makeSupplemental({
      vetClinic: { name: 'New Vet', address: '456 Elm St', phone: '555-0200' },
    });
    const diff = computePremiumDiff(
      original,
      finalSupplemental,
      original.narratives,
      original.style
    );
    expect(diff.fieldOverrides['vet_clinic']).toEqual({
      templateValue: original.supplemental.vetClinic,
      finalValue: finalSupplemental.vetClinic,
    });
  });

  it('records hospitality_notes override when hospitalityNotes changes', () => {
    const original = makeOriginal(makeSupplemental({ hospitalityNotes: null }));
    const finalSupplemental = makeSupplemental({ hospitalityNotes: 'Lunch provided' });
    const diff = computePremiumDiff(
      original,
      finalSupplemental,
      original.narratives,
      original.style
    );
    expect(diff.fieldOverrides['hospitality_notes']).toEqual({
      templateValue: null,
      finalValue: 'Lunch provided',
    });
  });

  it('records style override when style changes', () => {
    const original = makeOriginal();
    const diff = computePremiumDiff(original, original.supplemental, original.narratives, 'banner');
    expect(diff.fieldOverrides['style']).toEqual({
      templateValue: 'monogram',
      finalValue: 'banner',
    });
  });

  it('does not record style override when style is unchanged', () => {
    const original = makeOriginal();
    const diff = computePremiumDiff(
      original,
      original.supplemental,
      original.narratives,
      'monogram'
    );
    expect(diff.fieldOverrides['style']).toBeUndefined();
  });

  it('records showHours narrative edit when showHours changes', () => {
    const original = makeOriginal();
    const edited = {
      showHours: 'Edited hours.',
      trialInformation: original.narratives.trialInformation,
    };
    const diff = computePremiumDiff(original, original.supplemental, edited, original.style);
    expect(diff.narrativeEdits['showHours']).toEqual({
      generatedValue: original.narratives.showHours,
      finalValue: 'Edited hours.',
    });
    expect(diff.narrativeEdits['trialInformation']).toBeUndefined();
  });

  it('records trialInformation narrative edit when trialInformation changes', () => {
    const original = makeOriginal();
    const edited = {
      showHours: original.narratives.showHours,
      trialInformation: 'Updated trial info.',
    };
    const diff = computePremiumDiff(original, original.supplemental, edited, original.style);
    expect(diff.narrativeEdits['trialInformation']).toEqual({
      generatedValue: original.narratives.trialInformation,
      finalValue: 'Updated trial info.',
    });
    expect(diff.narrativeEdits['showHours']).toBeUndefined();
  });

  it('records both narrative edits when both change', () => {
    const original = makeOriginal();
    const edited = { showHours: 'New hours.', trialInformation: 'New trial info.' };
    const diff = computePremiumDiff(original, original.supplemental, edited, original.style);
    expect(diff.narrativeEdits['showHours']).toBeDefined();
    expect(diff.narrativeEdits['trialInformation']).toBeDefined();
  });

  it('detects accommodations change', () => {
    const original = makeOriginal();
    const newAccommodations = [{ name: 'Hilton', address: '200 Hotel Rd', phone: '918-222-2222' }];
    const result = computePremiumDiff(
      original,
      { ...original.supplemental, accommodations: newAccommodations },
      original.narratives,
      original.style
    );
    expect('accommodations' in result.fieldOverrides).toBe(true);
    expect(result.fieldOverrides['accommodations'].finalValue).toEqual(newAccommodations);
  });

  it('records multiple field overrides simultaneously', () => {
    const original = makeOriginal();
    const finalSupplemental = makeSupplemental({
      hospitalityNotes: 'Added note',
      awardsDescription: 'New award',
    });
    const diff = computePremiumDiff(
      original,
      finalSupplemental,
      original.narratives,
      original.style
    );
    expect(diff.fieldOverrides['hospitality_notes']).toBeDefined();
    expect(diff.fieldOverrides['awards_description']).toBeDefined();
    expect(diff.fieldOverrides['vet_clinic']).toBeUndefined();
  });

  it('does NOT flag vet_clinic as overridden when only key order differs', () => {
    // Postgres JSONB does not preserve insertion order on round-trip; the same
    // logical value can come back with shuffled keys. The diff must use a
    // stable serializer so this is not flagged as a user-driven override.
    const original = makeOriginal(
      makeSupplemental({
        vetClinic: { name: 'Riverside Vet', address: '123 Main St', phone: '555-0100' },
      })
    );
    const reorderedFinal = makeSupplemental({
      vetClinic: { phone: '555-0100', name: 'Riverside Vet', address: '123 Main St' },
    });
    const diff = computePremiumDiff(original, reorderedFinal, original.narratives, original.style);
    expect(diff.fieldOverrides['vet_clinic']).toBeUndefined();
  });
});
