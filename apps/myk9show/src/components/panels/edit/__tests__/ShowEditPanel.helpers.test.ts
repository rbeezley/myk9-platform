import { describe, expect, it } from 'vitest';
import type { GeneratedPremium } from '@/types/premium-types';
import { showSchemas } from '@/lib/validation';
import { formDataToShowSaveData, showToFormData, publishGateError } from '../ShowEditPanel.helpers';
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
  officials: { chairman: null, steward: null },
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

// Round-13 review: the panel's Basic Info tab offers "Published" in its
// Status dropdown, and the save path wrote formData.status straight through —
// the one remaining ungated shows.status write surface after rounds 8/11
// gated the pill, wizard, and bulk bar. Same fail-closed rules as the pill.
describe('publishGateError', () => {
  const enabled = { payouts_enabled: true };
  const disabled = { payouts_enabled: false };

  it('allows publishing with a payout-enabled account', () => {
    expect(publishGateError('draft', 'published', 'club-1', enabled)).toBeNull();
  });

  it('blocks newly publishing without a payout-enabled account', () => {
    expect(publishGateError('draft', 'published', 'club-1', null)).toMatch(/payment account/i);
    expect(publishGateError('draft', 'published', 'club-1', disabled)).toMatch(
      /payment account/i
    );
  });

  it('fails closed when no club is assigned', () => {
    expect(publishGateError('draft', 'published', '', enabled)).toMatch(/club/i);
  });

  it('never re-gates an already-published show (unrelated edits must save)', () => {
    expect(publishGateError('published', 'published', 'club-1', null)).toBeNull();
  });

  it('ignores non-publish transitions', () => {
    expect(publishGateError('draft', 'cancelled', 'club-1', null)).toBeNull();
    expect(publishGateError('published', 'draft', '', null)).toBeNull();
  });
});
