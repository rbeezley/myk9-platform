/**
 * ShowEditPanel - Helper Functions
 *
 * Validation, form data conversion, and other pure logic.
 */

import type { Show } from '@/types/show-types';
import type { ShowEditFormData } from './ShowEditPanel.types';

// Form validation
export const validateShowData = (data: ShowEditFormData): string[] | null => {
  const errors: string[] = [];

  if (!data.name?.trim()) {
    errors.push('Show name is required');
  }

  if (!data.clubId?.trim()) {
    errors.push('Hosting club is required');
  }

  if (!data.startDate?.trim()) {
    errors.push('Start date is required');
  }

  if (!data.endDate?.trim()) {
    errors.push('End date is required');
  }

  // Validate date logic
  if (data.startDate && data.endDate) {
    const startDate = new Date(data.startDate);
    const endDate = new Date(data.endDate);
    if (endDate < startDate) {
      errors.push('End date must be after start date');
    }
  }

  if (data.entryOpenDate && data.entryCloseDate) {
    const openDate = new Date(data.entryOpenDate);
    const closeDate = new Date(data.entryCloseDate);
    if (closeDate < openDate) {
      errors.push('Entry close date must be after entry open date');
    }
  }

  if (data.entryCloseDate && data.startDate) {
    const closeDate = new Date(data.entryCloseDate);
    const showDate = new Date(data.startDate);
    if (closeDate > showDate) {
      errors.push('Entry close date must be before show start date');
    }
  }

  // Validate fees if provided
  if (data.preEntryFee && isNaN(parseFloat(data.preEntryFee.replace(/[$,]/g, '')))) {
    errors.push('Pre-entry fee must be a valid amount');
  }

  if (data.dayOfShowFee && isNaN(parseFloat(data.dayOfShowFee.replace(/[$,]/g, '')))) {
    errors.push('Day of show fee must be a valid amount');
  }

  return errors.length > 0 ? errors : null;
};

// Convert Show to form data
export const showToFormData = (show: Partial<Show>): ShowEditFormData => {
  return {
    name: show.name || '',
    status: show.status || 'draft',
    type: show.type || '',
    clubId: show.clubId || '',
    startDate: show.startDate || '',
    endDate: show.endDate || '',
    location: show.location || '',
    chairman: show.chairman || '',
    secretary: show.secretary || '',
    chiefSteward: show.chiefSteward || '',
    entryOpenDate: show.entryOpenDate || '',
    entryCloseDate: show.entryCloseDate || '',
    preEntryFee: show.preEntryFee || '',
    dayOfShowFee: show.dayOfShowFee || '',
    assignedJudges: show.assignedJudges || [],
    ...(show.maxEntriesPerDog !== undefined && { maxEntriesPerDog: show.maxEntriesPerDog }),
    ...(show.maxTotalEntries !== undefined && { maxTotalEntries: show.maxTotalEntries }),
    ...(show.allowNonOwnerHandlers !== undefined && {
      allowNonOwnerHandlers: show.allowNonOwnerHandlers,
    }),
  };
};

// Convert form data back to Show
export const formDataToShow = (formData: ShowEditFormData): Partial<Show> => ({
  name: formData.name,
  status: formData.status,
  type: formData.type,
  clubId: formData.clubId,
  startDate: formData.startDate,
  endDate: formData.endDate,
  location: formData.location,
  chairman: formData.chairman,
  secretary: formData.secretary,
  chiefSteward: formData.chiefSteward,
  entryOpenDate: formData.entryOpenDate,
  entryCloseDate: formData.entryCloseDate,
  preEntryFee: formData.preEntryFee,
  dayOfShowFee: formData.dayOfShowFee,
  assignedJudges: formData.assignedJudges,
  maxEntriesPerDog: formData.maxEntriesPerDog,
  maxTotalEntries: formData.maxTotalEntries,
  allowNonOwnerHandlers: formData.allowNonOwnerHandlers,
});
