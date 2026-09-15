import { describe, expect, it } from 'vitest';
import type { GeneratedPremium } from '@/types/premium-types';
import { showSchemas } from '@/lib/validation';
import {
  formDataToShow,
  formDataToShowSaveData,
  showToFormData,
  publishGateError,
} from '../ShowEditPanel.helpers';
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

// MYK9-579 round 4: publishing now happens in exactly one place -- the
// status pill (ShowStatusPill.tsx) -- so the panel's Status dropdown no
// longer offers "Published" for a draft (see ShowEditBasicInfoTab.test.tsx
// for the dropdown-option coverage). publishGateError stays only as a
// minimal guard for the case this dropdown restriction cannot fully cover
// server-side: an already-published show being saved must never be
// re-gated, and a draft->published call (now unreachable from the UI, but
// not impossible to construct) must still fail closed.
describe('publishGateError', () => {
  const enabled = { payouts_enabled: true };
  const authorized = { authorized_at: '2026-01-01T00:00:00Z' };
  const unauthorized = { authorized_at: null };

  it('allows publishing with a payout-enabled account', () => {
    expect(publishGateError('draft', 'published', 'club-1', enabled, authorized)).toBeNull();
  });

  it('never re-gates an already-published show (unrelated edits must save)', () => {
    expect(publishGateError('published', 'published', 'club-1', null, null)).toBeNull();
    expect(publishGateError('published', 'published', 'club-1', enabled, authorized)).toBeNull();
  });

  it('ignores non-publish transitions', () => {
    expect(publishGateError('draft', 'cancelled', 'club-1', null, null)).toBeNull();
    expect(publishGateError('published', 'draft', '', null, null)).toBeNull();
  });

  it('still fails closed on a draft->published call, though the UI can no longer make one', () => {
    expect(publishGateError('draft', 'published', 'club-1', null, authorized)).toMatch(
      /payment account/i
    );
    expect(publishGateError('draft', 'published', '', enabled, null)).toMatch(/club/i);
  });

  // MYK9-572: a second, independent publish-gate check — a club must be
  // authorized by a site admin, regardless of Stripe readiness.
  describe('club authorization', () => {
    it('blocks newly publishing an unauthorized club before checking Stripe readiness', () => {
      expect(publishGateError('draft', 'published', 'club-1', enabled, unauthorized)).toMatch(
        /hasn't been authorized/i
      );
    });

    it('allows publishing once the club is authorized and Stripe-ready', () => {
      expect(publishGateError('draft', 'published', 'club-1', enabled, authorized)).toBeNull();
    });

    // Round-2 review (P2-5): a caller that could not read the club row (RLS,
    // failed fetch) must fail CLOSED, not skip the check — the prior version
    // of this test asserted the opposite (a bug: `club && ...` let a null
    // club bypass the gate entirely).
    it('fails closed when the club row could not be read (null or undefined)', () => {
      expect(publishGateError('draft', 'published', 'club-1', enabled, null)).toMatch(
        /hasn't been authorized/i
      );
      expect(
        publishGateError(
          'draft',
          'published',
          'club-1',
          enabled,
          undefined as unknown as { authorized_at: string | null } | null
        )
      ).toMatch(/hasn't been authorized/i);
    });

    it('never re-gates an already-published show even for an unauthorized club', () => {
      expect(
        publishGateError('published', 'published', 'club-1', enabled, unauthorized)
      ).toBeNull();
    });
  });
});
