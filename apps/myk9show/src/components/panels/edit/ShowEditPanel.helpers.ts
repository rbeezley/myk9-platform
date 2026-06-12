/**
 * ShowEditPanel - Helper Functions
 *
 * Form data conversion and other pure logic.
 * Validation is handled by showSchemas.edit in @/lib/validation.
 */

import { PUBLISH_BLOCKED_MESSAGE } from '@/features/payments/onlineEntryGate';
import type { Show } from '@/types/show-types';
import type { ShowStyle } from '@/features/registries';
import type { ShowEditFormData, ShowEditSaveData } from './ShowEditPanel.types';

// Publish gate for the panel's save path (round-13 review): the Basic Info
// tab offers "Published" in its Status dropdown, making this the fourth
// shows.status write surface — pill, wizard, and bulk bar are already
// gated/stripped. Same fail-closed rules as ShowStatusPill; already-published
// shows are never re-gated so unrelated edits keep saving.
export function publishGateError(
  originalStatus: string | undefined,
  nextStatus: string,
  clubId: string,
  account: { payouts_enabled: boolean } | null
): string | null {
  if (nextStatus !== 'published' || originalStatus === 'published') return null;
  if (!clubId) {
    return 'Assign a club to this show before publishing — entry fees are paid out to the club.';
  }
  if (account?.payouts_enabled !== true) {
    return PUBLISH_BLOCKED_MESSAGE;
  }
  return null;
}

// Convert Show to form data
export const showToFormData = (show: Partial<Show>): ShowEditFormData => {
  return {
    ...(show.id !== undefined && { id: show.id }),
    name: show.name || '',
    status: show.status || 'draft',
    organization: show.organization || '',
    clubId: show.clubId || '',
    startDate: show.startDate || '',
    endDate: show.endDate || '',
    location: show.location || '',
    entryOpenDate: show.entryOpenDate || '',
    entryCloseDate: show.entryCloseDate || '',
    preEntryFee: show.preEntryFee || '',
    dayOfShowFee: show.dayOfShowFee || '',
    assignedJudges: show.assignedJudges || [],
    startingArmbandNumber: show.startingArmbandNumber ?? 100,
    ...(show.maxEntriesPerDog !== undefined && { maxEntriesPerDog: show.maxEntriesPerDog }),
    ...(show.maxTotalEntries !== undefined && { maxTotalEntries: show.maxTotalEntries }),
    ...(show.allowNonOwnerHandlers !== undefined && {
      allowNonOwnerHandlers: show.allowNonOwnerHandlers,
    }),
    acceptCheckPayments: show.acceptCheckPayments ?? false,
    acceptCashPayments: show.acceptCashPayments ?? false,
    clubName: show.clubName || '',
    logoUrl: show.logoUrl || '',
    trials: show.trials || [],
    experiencePublishedContent: show.experiencePublishedContent ?? null,
    // Read show.style (migration 195) with fallback to landing_style (migration 192).
    // Map 'default' → 'monogram' so legacy rows never produce a value rejected by
    // the new shows_style_check constraint.
    style: ((): ShowStyle => {
      const raw = show.style ?? show.landing_style ?? 'monogram';
      return (raw === 'default' ? 'monogram' : raw) as ShowStyle;
    })(),
    publishExperience: false,
    inkSaver: false,
  };
};

// Convert form data back to Show
// Empty strings are omitted so the store skips them — prevents sending ''
// to Postgres DATE/numeric columns which would fail the entire mutation.
export const formDataToShow = (formData: ShowEditFormData): Partial<Show> => ({
  name: formData.name,
  status: formData.status,
  organization: formData.organization,
  clubId: formData.clubId,
  startDate: formData.startDate,
  endDate: formData.endDate,
  assignedJudges: formData.assignedJudges,
  startingArmbandNumber: formData.startingArmbandNumber,
  maxEntriesPerDog: formData.maxEntriesPerDog,
  maxTotalEntries: formData.maxTotalEntries,
  allowNonOwnerHandlers: formData.allowNonOwnerHandlers,
  acceptCheckPayments: formData.acceptCheckPayments,
  acceptCashPayments: formData.acceptCashPayments,
  style: formData.style,
  // Conditionally include optional string fields only when non-empty
  // (exactOptionalPropertyTypes forbids assigning undefined to string properties)
  ...(formData.location && { location: formData.location }),
  ...(formData.entryOpenDate && { entryOpenDate: formData.entryOpenDate }),
  ...(formData.entryCloseDate && { entryCloseDate: formData.entryCloseDate }),
  ...(formData.preEntryFee && { preEntryFee: formData.preEntryFee }),
  ...(formData.dayOfShowFee && { dayOfShowFee: formData.dayOfShowFee }),
});

export const formDataToShowSaveData = (formData: ShowEditFormData): ShowEditSaveData => ({
  ...formDataToShow(formData),
  ...(formData.publishExperience !== undefined && {
    publishExperience: formData.publishExperience,
  }),
  ...(formData.generatedPremium !== undefined && { generatedPremium: formData.generatedPremium }),
  ...(formData.inkSaver !== undefined && { inkSaver: formData.inkSaver }),
});
