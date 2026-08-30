import type { NavigateFunction } from 'react-router-dom';
import type { ShowPasscodes } from '@myk9/core';
import type { ShowStatus } from './show-creation-wizard-types';

type OnCreated = (
  showId: string,
  showName: string,
  passcodes: ShowPasscodes | null,
  passcodeError?: string | null
) => void;

interface FinishShowSaveOptions {
  status: ShowStatus;
  shouldShowCompletion: boolean;
  isEditMode: boolean;
  showId: string;
  showName: string;
  passcodes: ShowPasscodes | null;
  passcodeError: string | null;
  onCreated: OnCreated | undefined;
  navigate: NavigateFunction;
}

export async function createDraftShow(
  saveShow: (status: ShowStatus, shouldShowCompletion: boolean) => Promise<void>
): Promise<void> {
  await saveShow('draft', true);
}

export function finishShowSave({
  status,
  shouldShowCompletion,
  isEditMode,
  showId,
  showName,
  passcodes,
  passcodeError,
  onCreated,
  navigate,
}: FinishShowSaveOptions): void {
  // Edit-mode saves update an existing show; they do not own creation-only
  // completion content such as one-time access codes.
  if (isEditMode) {
    navigate(`/shows/${showId}`);
  } else if (shouldShowCompletion && onCreated) {
    onCreated(showId, showName, passcodes, passcodeError);
  } else if (status === 'draft') {
    navigate(`/shows/${showId}`);
  } else if (onCreated) {
    onCreated(showId, showName, passcodes, passcodeError);
  } else {
    navigate('/secretary/dashboard');
  }
}
