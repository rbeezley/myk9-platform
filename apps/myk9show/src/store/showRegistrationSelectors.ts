import type {
  ShowRegistration,
  ShowEntry,
  ClassEntry,
  ArmbandAssignment,
  StatusChange,
  RegistrationFormData,
  RegistrationContext,
} from '../types/show-registration-types';

export interface ShowRegistrationState {
  registrations: ShowRegistration[];
  currentRegistration: ShowRegistration | null;
  draftData: Partial<RegistrationFormData>;
  registrationContext: RegistrationContext | null;
}

export const selectRegistration = (
  state: ShowRegistrationState,
  registrationId: string
): ShowRegistration | undefined => state.registrations.find(reg => reg.id === registrationId);

export const selectRegistrationsByShow = (
  state: ShowRegistrationState,
  showId: string
): ShowRegistration[] => state.registrations.filter(reg => reg.showId === showId);

export const selectRegistrationsByUser = (
  state: ShowRegistrationState,
  userId: string
): ShowRegistration[] => state.registrations.filter(reg => reg.userId === userId);

export const selectCurrentRegistration = (state: ShowRegistrationState): ShowRegistration | null =>
  state.currentRegistration;

export const selectEntry = (
  state: ShowRegistrationState,
  registrationId: string,
  entryId: string
): ShowEntry | undefined => {
  const reg = selectRegistration(state, registrationId);
  return reg?.entries.find(entry => entry.id === entryId);
};

export const selectEntriesForRegistration = (
  state: ShowRegistrationState,
  registrationId: string
): ShowEntry[] => {
  const reg = selectRegistration(state, registrationId);
  return reg?.entries ?? [];
};

export const selectClass = (
  state: ShowRegistrationState,
  registrationId: string,
  entryId: string,
  classId: string
): ClassEntry | undefined => {
  const entry = selectEntry(state, registrationId, entryId);
  return entry?.classes.find(cls => cls.id === classId);
};

export const selectClassesForEntry = (
  state: ShowRegistrationState,
  registrationId: string,
  entryId: string
): ClassEntry[] => {
  const entry = selectEntry(state, registrationId, entryId);
  return entry?.classes ?? [];
};

export const selectArmbandsByShow = (
  state: ShowRegistrationState,
  showId: string
): { entryId: string; armband: ArmbandAssignment }[] => {
  const armbands: { entryId: string; armband: ArmbandAssignment }[] = [];
  for (const reg of state.registrations) {
    if (reg.showId !== showId) continue;
    for (const entry of reg.entries) {
      if (entry.armbandAssignment) {
        armbands.push({ entryId: entry.id, armband: entry.armbandAssignment });
      }
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
): StatusChange[] => selectRegistration(state, registrationId)?.statusHistory ?? [];
