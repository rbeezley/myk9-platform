import type {
  ShowRegistration,
  ShowEntry,
  ClassEntry,
  ArmbandAssignment,
  StatusChange,
  RegistrationFormData,
  RegistrationContext,
} from '../types/show-registration-types';
import {
  reassembleRegistration,
  type StoredShowRegistration,
  type StoredShowEntry,
} from './buildRegistrationIndexes';

export interface ShowRegistrationState {
  registrations: ShowRegistration[];
  currentRegistration: ShowRegistration | null;
  draftData: Partial<RegistrationFormData>;
  registrationContext: RegistrationContext | null;
  registrationsById: Record<string, StoredShowRegistration>;
  entriesById: Record<string, StoredShowEntry>;
  classesById: Record<string, ClassEntry>;
}

export const selectRegistration = (
  state: ShowRegistrationState,
  registrationId: string
): ShowRegistration | undefined => {
  const stored = state.registrationsById[registrationId];
  if (!stored) return undefined;
  return reassembleRegistration(stored, state.entriesById, state.classesById);
};

export const selectRegistrationsByShow = (
  state: ShowRegistrationState,
  showId: string
): ShowRegistration[] =>
  Object.values(state.registrationsById)
    .filter(r => r.showId === showId)
    .map(r => reassembleRegistration(r, state.entriesById, state.classesById));

export const selectRegistrationsByUser = (
  state: ShowRegistrationState,
  userId: string
): ShowRegistration[] =>
  Object.values(state.registrationsById)
    .filter(r => r.userId === userId)
    .map(r => reassembleRegistration(r, state.entriesById, state.classesById));

export const selectCurrentRegistration = (state: ShowRegistrationState): ShowRegistration | null =>
  state.currentRegistration;

export const selectEntry = (
  state: ShowRegistrationState,
  registrationId: string,
  entryId: string
): ShowEntry | undefined => {
  const stored = state.entriesById[entryId];
  if (!stored || stored.registrationId !== registrationId) return undefined;
  return {
    ...stored,
    classes: Object.values(state.classesById).filter(c => c.entryId === entryId),
  };
};

export const selectEntriesForRegistration = (
  state: ShowRegistrationState,
  registrationId: string
): ShowEntry[] => selectRegistration(state, registrationId)?.entries ?? [];

export const selectClass = (
  state: ShowRegistrationState,
  registrationId: string,
  entryId: string,
  classId: string
): ClassEntry | undefined => {
  const cls = state.classesById[classId];
  if (!cls || cls.entryId !== entryId) return undefined;
  // Validate the entry belongs to the registration
  const entry = state.entriesById[entryId];
  if (!entry || entry.registrationId !== registrationId) return undefined;
  return cls;
};

export const selectClassesForEntry = (
  state: ShowRegistrationState,
  registrationId: string,
  entryId: string
): ClassEntry[] => {
  const entry = state.entriesById[entryId];
  if (!entry || entry.registrationId !== registrationId) return [];
  return Object.values(state.classesById).filter(c => c.entryId === entryId);
};

export const selectArmbandsByShow = (
  state: ShowRegistrationState,
  showId: string
): { entryId: string; armband: ArmbandAssignment }[] => {
  const showRegIds = new Set(
    Object.values(state.registrationsById)
      .filter(r => r.showId === showId)
      .map(r => r.id)
  );
  const armbands: { entryId: string; armband: ArmbandAssignment }[] = [];
  for (const entry of Object.values(state.entriesById)) {
    if (showRegIds.has(entry.registrationId) && entry.armbandAssignment) {
      armbands.push({ entryId: entry.id, armband: entry.armbandAssignment });
    }
  }
  return armbands;
};

export const selectArmbandConflict = (
  state: ShowRegistrationState,
  showId: string,
  armband: string,
  excludeEntryId?: string
): boolean => {
  const armbands = selectArmbandsByShow(state, showId);
  return armbands.some(item => item.armband.number === armband && item.entryId !== excludeEntryId);
};

export const selectStatusHistory = (
  state: ShowRegistrationState,
  registrationId: string
): StatusChange[] => state.registrationsById[registrationId]?.statusHistory ?? [];
