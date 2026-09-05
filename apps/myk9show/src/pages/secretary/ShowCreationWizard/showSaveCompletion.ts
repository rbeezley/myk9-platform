import type { NavigateFunction } from 'react-router-dom';
import type { ShowPasscodes } from '@myk9/core';
import type { EditMode, ShowStatus } from './show-creation-wizard-types';

type OnCreated = (
  showId: string,
  showName: string,
  passcodes: ShowPasscodes | null,
  passcodeError?: string | null
) => void;

interface FinishShowSaveOptions {
  status: ShowStatus;
  shouldShowCompletion: boolean;
  /**
   * The wizard's edit context, passed WHOLE rather than pre-derived to a
   * boolean. Both call sites already hold this exact object and it already
   * drives the submit label (`getSubmitLabel(editMode?.mode)`), so passing it
   * through keeps one source of truth. A pre-derived flag would be a second
   * one that has to agree — which is the shape of the bug this guard fixes:
   * the button's label knew it was an edit and the handler behind it did not.
   */
  editMode: EditMode | undefined;
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
  editMode,
  showId,
  showName,
  passcodes,
  passcodeError,
  onCreated,
  navigate,
}: FinishShowSaveOptions): void {
  // Edit-mode saves update an existing show; they do not own creation-only
  // completion content. Routing them to the creation overlay told a secretary
  // "Show Created!" for a show that already existed, claimed it had no access
  // codes while `show_passcodes` held rows for it, and offered the destructive
  // regenerate CTA on a live show (confirmed in the browser 2026-09-05).
  if (editMode?.showId) {
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
