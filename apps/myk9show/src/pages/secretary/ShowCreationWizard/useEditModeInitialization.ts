/**
 * Builds the wizard draft from an existing show when the wizard opens in an
 * edit mode, and backfills that show's officials.
 *
 * Extracted from ShowCreationWizardPage so the page keeps only layout and the
 * hook owns the two rules that are easy to get wrong:
 *
 *  1. Never initialize over unsaved work. The initialization key includes the
 *     class count so classes replicating in late still refresh the draft — but
 *     `loadDraft()` overwrites whatever the secretary has typed since, so a
 *     late arrival must not cost her an edit in progress.
 *  2. Report a failed officials read as UNKNOWN, not as "no officials". The
 *     draft starts with empty officials arrays, so a failed backfill left the
 *     wizard asserting the show had none — and validation then demanded a
 *     chairman and secretary that already existed.
 */
import { useEffect, useRef, useState } from 'react';
import { getShowOfficials } from '@/hooks/queries/useShowOfficials';
import { useWizardStore } from '@/store/wizardStore';
import type { Trial } from '@/store/trialStore';
import type { SyncableClassData } from '@/store/classStore';
import type { User } from '@/types/user-types';
import { buildEditModeDraft } from './buildEditModeDraft';
import type { EditMode } from './show-creation-wizard-types';
import type { EditModeResolution } from './editModeResolution';

interface UseEditModeInitializationArgs {
  editMode: EditMode | undefined;
  editModeResolution: EditModeResolution;
  existingTrials: Trial[];
  existingClasses: SyncableClassData[];
  people: User[];
  isDirty: boolean;
  loadDraft: (draft: ReturnType<typeof buildEditModeDraft>) => void;
}

export interface EditModeInitializationState {
  /** True when the show's existing officials could not be read. */
  officialsUnavailable: boolean;
  /** Clears the init guard so a retry re-runs the draft build. */
  resetInitialization: () => void;
}

export function useEditModeInitialization({
  editMode,
  editModeResolution,
  existingTrials,
  existingClasses,
  people,
  isDirty,
  loadDraft,
}: UseEditModeInitializationArgs): EditModeInitializationState {
  const initializedRef = useRef<string | null>(null);
  const [officialsUnavailable, setOfficialsUnavailable] = useState(false);

  useEffect(() => {
    if (!editMode) return;

    const existingShow =
      editModeResolution.state === 'resolved' ? editModeResolution.show : undefined;
    if (!existingShow) return;

    const showTrials = existingTrials.filter(trial => trial.showId === editMode.showId);
    const showTrialIds = new Set(showTrials.map(trial => trial.id));
    const classCount = existingClasses.filter(c => showTrialIds.has(c.trialId)).length;
    const initializationKey =
      editMode.mode === 'add-trials'
        ? `${editMode.showId}:${editMode.mode}`
        : `${editMode.showId}:${editMode.mode}:${classCount}`;

    // Late-replicating data is worth less than an edit in progress.
    const wouldDiscardEdits = initializedRef.current !== null && isDirty;
    if (initializedRef.current === initializationKey || wouldDiscardEdits) return;

    initializedRef.current = initializationKey;

    // Load with empty officials, then backfill asynchronously.
    loadDraft(buildEditModeDraft({ editMode, existingShow, showTrials, existingClasses, people }));

    getShowOfficials(existingShow.id)
      .then(officials => {
        setOfficialsUnavailable(false);
        useWizardStore.setState(state => ({
          show: {
            ...state.show,
            officials: {
              secretary: officials.secretaries.map(s => s.personId),
              chairman: officials.chairmen.map(c => c.personId),
              steward: officials.stewards.map(s => s.personId),
            },
          },
        }));
      })
      .catch(() => {
        // The draft's empty officials are now indistinguishable from a show
        // that genuinely has none. Say so rather than letting validation
        // demand officials that may already exist.
        setOfficialsUnavailable(true);
      });
  }, [editMode, editModeResolution, existingTrials, existingClasses, people, isDirty, loadDraft]);

  return {
    officialsUnavailable,
    // Only clears the guard when there is nothing to lose. Clearing it
    // unconditionally disarmed `wouldDiscardEdits` below, so pressing the
    // gate's "Try again" re-armed loadDraft over work in progress.
    resetInitialization: () => {
      if (!isDirty) initializedRef.current = null;
    },
  };
}
