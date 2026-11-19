import { describe, expect, it } from 'vitest';
import type { GeneratedPremium } from '@/types/premium-types';
import { NOTE_TO_EXHIBITORS_MAX_LENGTH, showSchemas } from '@/lib/validation';
import { formDataToShow, formDataToShowSaveData, showToFormData } from '../ShowEditPanel.helpers';
import type { ShowEditFormData } from '../ShowEditPanel.types';

const generatedPremium: GeneratedPremium = {
  org: 'AKC',
  style: 'fieldGuide',
  templateId: null,
  show: {
    name: 'QA Walk Show',
    startDate: '2026-05-22',
    endDate: '2026-05-23',
    venue: 'Memorial Coliseum',
    entryOpenDate: null,
    entryCloseDate: null,
    preEntryFee: 0,
    dayOfFee: 0,
    acceptChecks: false,
    acceptCash: false,
  },
  club: { name: 'Test Club', logoUrl: null },
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
  narratives: {
    showHours: 'Show hours.',
    trialInformation: 'Trial information.',
  },
};

const baseFormData: ShowEditFormData = {
  id: 'show-1',
  name: 'QA Walk Show',
  status: 'published',
  organization: 'AKC',
  clubId: 'club-1',
  startDate: '2026-05-22',
  endDate: '2026-05-23',
  location: 'Memorial Coliseum',
  entryOpenDate: '2026-04-27',
  entryCloseDate: '2026-05-21',
  preEntryFee: '0',
  dayOfShowFee: '0',
  assignedJudges: [],
  acceptCheckPayments: false,
  acceptCashPayments: false,
  style: 'fieldGuide',
};

describe('ShowEditPanel helpers', () => {
  it('treats publish as a per-save action for already-published shows', () => {
    const result = showToFormData({
      id: 'show-1',
      name: 'QA Walk Show',
      status: 'published',
      organization: 'AKC',
      clubId: 'club-1',
      startDate: '2026-05-22',
      endDate: '2026-05-23',
      experienceIsPublished: true,
    });

    expect(result.publishExperience).toBe(false);
  });

  it('round-trips the isNationals flag through form mapping', () => {
    expect(
      showToFormData({
        id: 'show-1',
        name: 'Nationals Show',
        organization: 'AKC',
        clubId: 'club-1',
        startDate: '2026-05-22',
        endDate: '2026-05-23',
        isNationals: true,
      }).isNationals
    ).toBe(true);

    expect(formDataToShow({ ...baseFormData, isNationals: true }).isNationals).toBe(true);
  });

  it('saves a junior handler fee and lets the secretary clear it', () => {
    expect(showToFormData({ juniorHandlerFee: '15' }).juniorHandlerFee).toBe('15');
    expect(formDataToShow({ ...baseFormData, juniorHandlerFee: '15' }).juniorHandlerFee).toBe('15');
    expect(formDataToShow({ ...baseFormData, juniorHandlerFee: '' }).juniorHandlerFee).toBe('');
    expect(formDataToShow({ ...baseFormData, juniorHandlerFee: '  ' }).juniorHandlerFee).toBe('');
    expect(formDataToShow({ ...baseFormData, juniorHandlerFee: ' 15.25 ' }).juniorHandlerFee).toBe(
      '15.25'
    );
  });

  it('validates the junior handler fee like a currency amount', () => {
    const parse = (juniorHandlerFee: string) =>
      showSchemas.edit.safeParse({ ...baseFormData, juniorHandlerFee }).success;
    expect(parse('-1')).toBe(false);
    expect(parse('15.999')).toBe(false);
    expect(parse('100000')).toBe(false);
    expect(parse('99999.99')).toBe(true);
    expect(parse('')).toBe(true);
  });

  it('accepts only a positive whole-number entry cap, or none (MYK9-2220)', () => {
    const parse = (maxTotalEntries: number | undefined) =>
      showSchemas.edit.safeParse({ ...baseFormData, maxTotalEntries }).success;
    expect(parse(12.5)).toBe(false);
    expect(parse(0)).toBe(false);
    expect(parse(-3)).toBe(false);
    expect(parse(2147483648)).toBe(false);
    expect(parse(120)).toBe(true);
    expect(parse(undefined)).toBe(true);
  });

  it('accepts only a positive whole-number per-dog cap, or none (MYK9-2221)', () => {
    const parse = (maxEntriesPerDog: number | undefined) =>
      showSchemas.edit.safeParse({ ...baseFormData, maxEntriesPerDog }).success;
    expect(parse(2.5)).toBe(false);
    expect(parse(0)).toBe(false);
    expect(parse(3)).toBe(true);
    expect(parse(undefined)).toBe(true);
  });

  it('clears a stale junior rate when saving an ASCA show', () => {
    expect(
      formDataToShow({ ...baseFormData, organization: 'ASCA', juniorHandlerFee: '15' })
        .juniorHandlerFee
    ).toBe('');
  });

  it('writes nothing for an ASCA show that has no junior rate to clear', () => {
    const form = showToFormData({ organization: 'ASCA' });
    expect(formDataToShow({ ...form, name: 'Renamed' })).not.toHaveProperty('juniorHandlerFee');
  });

  it('keeps an existing junior fee through an unrelated edit', () => {
    const form = showToFormData({ organization: 'AKC', juniorHandlerFee: '15' });
    expect(formDataToShow({ ...form, name: 'Renamed' }).juniorHandlerFee).toBe('15');
  });

  it('does not send a junior fee for a show that has none, so an unrelated edit cannot clear one', () => {
    const form = showToFormData({ organization: 'AKC' });
    expect(form).not.toHaveProperty('juniorHandlerFee');
    expect(formDataToShow({ ...form, name: 'Renamed' })).not.toHaveProperty('juniorHandlerFee');
  });

  it('preserves publish-only fields for the save side effect payload', () => {
    const result = formDataToShowSaveData({
      ...baseFormData,
      publishExperience: true,
      generatedPremium,
      inkSaver: true,
    });

    expect(result.style).toBe('fieldGuide');
    expect(result.publishExperience).toBe(true);
    expect(result.generatedPremium).toBe(generatedPremium);
    expect(result.inkSaver).toBe(true);
  });

  it('keeps publish-only fields through edit form validation', () => {
    const parsed = showSchemas.edit.parse({
      ...baseFormData,
      publishExperience: true,
      generatedPremium,
      inkSaver: true,
    });

    expect(parsed.publishExperience).toBe(true);
    expect(parsed.generatedPremium).toBe(generatedPremium);
    expect(parsed.inkSaver).toBe(true);
  });

  it('keeps the Nationals flag through edit form validation', () => {
    const result = showSchemas.edit.safeParse({ ...baseFormData, isNationals: true });

    expect(result.success).toBe(true);
    expect(result.success && result.data.isNationals).toBe(true);
  });

  it('blocks publishing before shared show content is ready', () => {
    const parsed = showSchemas.edit.safeParse({
      ...baseFormData,
      publishExperience: true,
      generatedPremium: undefined,
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toMatch(/shared show content/i);
  });
});

describe('note to exhibitors (MYK9-2114)', () => {
  it('keeps the note through edit form validation, then saves it', () => {
    const parsed = showSchemas.edit.parse({
      ...baseFormData,
      confirmationMessage: '  Park in the north lot.  ',
    });
    expect(parsed.confirmationMessage).toBe('  Park in the north lot.  ');
    expect(formDataToShowSaveData(parsed as ShowEditFormData).confirmationMessage).toBe(
      'Park in the north lot.'
    );
    const cleared = showSchemas.edit.parse({ ...baseFormData, confirmationMessage: '' });
    expect(formDataToShowSaveData(cleared as ShowEditFormData).confirmationMessage).toBe('');
  });

  it('rejects a note over the limit', () => {
    const result = showSchemas.edit.safeParse({
      ...baseFormData,
      confirmationMessage: 'x'.repeat(NOTE_TO_EXHIBITORS_MAX_LENGTH + 1),
    });
    expect(result.success).toBe(false);
  });

  it('loads the saved note into the form', () => {
    expect(
      showToFormData({ confirmationMessage: 'Park in the north lot.' }).confirmationMessage
    ).toBe('Park in the north lot.');
    expect(showToFormData({}).confirmationMessage).toBe('');
  });

  it('saves the note, and an empty box saves an empty string the mapper turns into null', () => {
    expect(
      formDataToShow({ ...baseFormData, confirmationMessage: 'Park in the north lot.' })
        .confirmationMessage
    ).toBe('Park in the north lot.');
    expect(
      formDataToShow({ ...baseFormData, confirmationMessage: '   ' }).confirmationMessage
    ).toBe('');
  });
});
