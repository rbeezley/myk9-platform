/**
 * ShowEditPanel - Helper Functions
 *
 * Form data conversion and other pure logic.
 * Validation is handled by showSchemas.edit in @/lib/validation.
 */

import type { Show } from '@/types/show-types';
import type { ShowAscaFacts } from '@/services/replication/showAscaFactColumns';
import type { ShowStyle } from '@/features/registries';
import type { ShowEditFormData, ShowEditSaveData } from './ShowEditPanel.types';

// MYK9-2290: a cleared choice or box saves null, which clears the column.
export const ascaFactsFromForm = (formData: ShowEditFormData): ShowAscaFacts => {
  const status = formData.ascaSanctionStatus;
  const policy = formData.spectatorsPolicy;
  return {
    ...(status !== undefined && {
      ascaSanctionStatus: status === 'pending' || status === 'approved' ? status : null,
    }),
    ...(formData.scentsByLevel !== undefined && {
      scentsByLevel: formData.scentsByLevel.trim() || null,
    }),
    ...(policy !== undefined && {
      spectatorsPolicy: policy === 'allowed' || policy === 'not_allowed' ? policy : null,
    }),
    ...(formData.photographerContact !== undefined && {
      photographerContact: formData.photographerContact.trim() || null,
    }),
  };
};

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
    ...(show.juniorHandlerFee !== undefined ? { juniorHandlerFee: show.juniorHandlerFee } : {}),
    assignedJudges: show.assignedJudges || [],
    startingArmbandNumber: show.startingArmbandNumber ?? 100,
    ...(show.maxEntriesPerDog !== undefined && { maxEntriesPerDog: show.maxEntriesPerDog }),
    ...(show.maxTotalEntries !== undefined && { maxTotalEntries: show.maxTotalEntries }),
    ...(show.allowNonOwnerHandlers !== undefined && {
      allowNonOwnerHandlers: show.allowNonOwnerHandlers,
    }),
    isNationals: show.isNationals ?? false,
    acceptCheckPayments: show.acceptCheckPayments ?? false,
    acceptCashPayments: show.acceptCashPayments ?? false,
    clubName: show.clubName || '',
    logoUrl: show.logoUrl || '',
    confirmationMessage: show.confirmationMessage ?? '',
    ascaSanctionStatus: show.ascaSanctionStatus ?? '',
    scentsByLevel: show.scentsByLevel ?? '',
    spectatorsPolicy: show.spectatorsPolicy ?? '',
    photographerContact: show.photographerContact ?? '',
    trials: show.trials || [],
    feesAsOpened: {
      preEntryFee: show.preEntryFee || '',
      dayOfShowFee: show.dayOfShowFee || '',
      juniorHandlerFee: show.juniorHandlerFee,
    },
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
// Online entries are deliberately absent: they are always on and the column is RPC-owned
// (MYK9-979, MYK9-2164), so no form save can resend a stale copy of it.
export const formDataToShow = (formData: ShowEditFormData): Partial<Show> => ({
  name: formData.name,
  status: formData.status,
  organization: formData.organization,
  clubId: formData.clubId,
  // startDate / endDate are deliberately absent: a show's dates are its trials' dates
  // (MYK9-2131), kept by the database, so Show Edit never sends them.
  assignedJudges: formData.assignedJudges,
  startingArmbandNumber: formData.startingArmbandNumber,
  maxEntriesPerDog: formData.maxEntriesPerDog,
  maxTotalEntries: formData.maxTotalEntries,
  allowNonOwnerHandlers: formData.allowNonOwnerHandlers,
  isNationals: formData.isNationals,
  acceptCheckPayments: formData.acceptCheckPayments,
  acceptCashPayments: formData.acceptCashPayments,
  style: formData.style,
  // An emptied box saves '', which the mapper and the replicated row turn into null.
  ...(formData.confirmationMessage !== undefined && {
    confirmationMessage: formData.confirmationMessage.trim(),
  }),
  ...ascaFactsFromForm(formData),
  // Conditionally include optional string fields only when non-empty
  // (exactOptionalPropertyTypes forbids assigning undefined to string properties)
  ...(formData.location && { location: formData.location }),
  ...(formData.entryOpenDate && { entryOpenDate: formData.entryOpenDate }),
  ...(formData.entryCloseDate && { entryCloseDate: formData.entryCloseDate }),
  ...(formData.preEntryFee && { preEntryFee: formData.preEntryFee }),
  ...(formData.dayOfShowFee && { dayOfShowFee: formData.dayOfShowFee }),
  // ASCA has no junior tier: clear a stale rate, but write nothing when there is none.
  ...(formData.organization === 'ASCA'
    ? formData.juniorHandlerFee
      ? { juniorHandlerFee: '' }
      : {}
    : formData.juniorHandlerFee !== undefined
      ? { juniorHandlerFee: formData.juniorHandlerFee.trim() }
      : {}),
});

export const formDataToShowSaveData = (formData: ShowEditFormData): ShowEditSaveData => ({
  ...formDataToShow(formData),
  ...(formData.publishExperience !== undefined && {
    publishExperience: formData.publishExperience,
  }),
  ...(formData.generatedPremium !== undefined && { generatedPremium: formData.generatedPremium }),
  ...(formData.inkSaver !== undefined && { inkSaver: formData.inkSaver }),
});

// MYK9-2081: the save names only the fields the user changed, compared after the same
// normalisation the save applies (trim, empty-to-omitted, ASCA junior fee). A switch or setting
// the form shows but the user never touched is never sent, so a copy opened before another
// device changed it cannot write the old value back. The judge list is the exception: the
// caller diffs it against the show's own list and reads a missing list as "no judges".
export const changedShowSaveData = (
  initial: ShowEditFormData,
  current: ShowEditFormData
): ShowEditSaveData => {
  const before = formDataToShowSaveData(initial) as Record<string, unknown>;
  const after = formDataToShowSaveData(current) as Record<string, unknown>;
  const changed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(after)) {
    if (JSON.stringify(value) !== JSON.stringify(before[key])) changed[key] = value;
  }
  if ('assignedJudges' in after) changed.assignedJudges = after.assignedJudges;
  return changed as ShowEditSaveData;
};

// True when the user changed anything a save would send.
export const hasShowChanges = (initial: ShowEditFormData, current: ShowEditFormData): boolean => {
  const changed = changedShowSaveData(initial, current);
  const judgesChanged =
    JSON.stringify(current.assignedJudges) !== JSON.stringify(initial.assignedJudges);
  return Object.keys(changed).some(key => key !== 'assignedJudges') || judgesChanged;
};
