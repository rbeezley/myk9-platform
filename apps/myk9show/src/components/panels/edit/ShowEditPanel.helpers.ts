/**
 * ShowEditPanel - Helper Functions
 *
 * Form data conversion and other pure logic.
 * Validation is handled by showSchemas.edit in @/lib/validation.
 */

import type { Show } from '@/types/show-types';
import type { ShowEditFormData } from './ShowEditPanel.types';

// Convert Show to form data
export const showToFormData = (show: Partial<Show>): ShowEditFormData => {
  return {
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
  // Conditionally include optional string fields only when non-empty
  // (exactOptionalPropertyTypes forbids assigning undefined to string properties)
  ...(formData.location && { location: formData.location }),
  ...(formData.entryOpenDate && { entryOpenDate: formData.entryOpenDate }),
  ...(formData.entryCloseDate && { entryCloseDate: formData.entryCloseDate }),
  ...(formData.preEntryFee && { preEntryFee: formData.preEntryFee }),
  ...(formData.dayOfShowFee && { dayOfShowFee: formData.dayOfShowFee }),
});
