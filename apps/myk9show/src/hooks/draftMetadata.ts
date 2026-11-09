import { RegistrationFormData } from '../types/show-registration-types';

export interface DraftMetadata {
  id: string;
  showId: string;
  userId: string;
  timestamp: number;
  stepCompleted: string;
  title: string;
  preview: string;
  /** Read from the saved payload when listing drafts. */
  selectedDogsCount?: number;
  completed?: boolean;
}

export interface SavedDraft {
  metadata: DraftMetadata;
  data: Partial<RegistrationFormData>;
}

export interface DraftMetadataScope {
  showId: string;
  userId: string;
  currentStep: string;
}

/** Human-readable summary of what a draft holds, for the draft list. */
export function buildDraftPreview(data: Partial<RegistrationFormData>): string {
  const selectedDogs = data.selectedDogs?.length || 0;
  const selectedClasses =
    data.entries?.reduce((total, entry) => total + (entry.classes?.length || 0), 0) || 0;

  let preview = '';
  if (selectedDogs > 0) {
    preview += `${selectedDogs} dog${selectedDogs !== 1 ? 's' : ''}`;
  }
  if (selectedClasses > 0) {
    preview += `${preview ? ', ' : ''}${selectedClasses} class${selectedClasses !== 1 ? 'es' : ''}`;
  }
  return preview || 'New registration';
}

/** Fresh metadata for a draft payload. Mints a new id on every call. */
export function createDraftMetadata(
  data: Partial<RegistrationFormData>,
  { showId, userId, currentStep }: DraftMetadataScope
): DraftMetadata {
  return {
    id: crypto.randomUUID(),
    showId,
    userId,
    timestamp: Date.now(),
    stepCompleted: data._workflowState?.currentStep ?? currentStep,
    title: `Draft from ${new Date().toLocaleDateString()}`,
    preview: buildDraftPreview(data),
  };
}
