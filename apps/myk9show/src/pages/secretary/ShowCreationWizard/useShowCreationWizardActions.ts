/**
 * Custom hook for Show Creation Wizard actions
 * Handles save, create, and publish operations
 */

import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { logger } from '@/services/LoggingService';
import { useWizardStore } from '@/store/wizardStore';
import { useShowStore } from '@/store/showStore';
import { useClubStore } from '@/store/clubStore';
import { useTrialStore, type TrialInput } from '@/store/trialStore';
import { useClassStoreCompat } from '@/hooks/useClassStoreCompat';
import { useAuthContext } from '@/hooks/useAuthContext';
import type { Show } from '@/types/show-types';
import type { EditMode, ShowStatus } from './show-creation-wizard-types';
import {
  createClassDataFromWizard,
  showToShowInput,
  transformWizardDataToShow,
} from './showCreationWizardTransformers';

interface UseShowCreationWizardActionsOptions {
  editMode?: EditMode | undefined;
  setIsLoading: (loading: boolean) => void;
}

export function useShowCreationWizardActions({
  editMode,
  setIsLoading,
}: UseShowCreationWizardActionsOptions) {
  const navigate = useNavigate();

  const { show, trials, judgeDetails, saveProgress, resetWizard } = useWizardStore();
  const { addShow, updateShow } = useShowStore();
  const { clubs } = useClubStore();
  const { addTrial: addTrialToStore, trials: existingTrials } = useTrialStore();
  const { addClass } = useClassStoreCompat();
  const { user } = useAuthContext();

  /**
   * Create trials in the trial store
   * Returns a map from wizard trial ID to actual DB UUID
   */
  const createTrials = useCallback(async (showId: string, showName: string, showType: string): Promise<Record<string, string>> => {
    const trialIdMap: Record<string, string> = {};

    // In edit mode, only add trials that don't already exist
    const trialsToAdd = editMode
      ? (() => {
          const existingTrialIds = existingTrials
            .filter(t => t.showId === showId)
            .map(t => t.id);
          return trials.filter(wizardTrial => !existingTrialIds.includes(wizardTrial.id));
        })()
      : trials;

    // Also map existing trials (edit mode) to themselves
    if (editMode) {
      const existingTrialIds = existingTrials
        .filter(t => t.showId === showId)
        .map(t => t.id);
      trials.forEach(wizardTrial => {
        if (existingTrialIds.includes(wizardTrial.id)) {
          trialIdMap[wizardTrial.id] = wizardTrial.id;
        }
      });
    }

    // Create new trials and collect their real UUIDs
    for (let index = 0; index < trialsToAdd.length; index++) {
      const wizardTrial = trialsToAdd[index];
      const trialName = wizardTrial.name || `Trial ${index + 1}`;
      const newTrial: TrialInput = {
        showId,
        showName,
        name: trialName,
        trialDate: wizardTrial.dateTime,
        trialNumber: trialName,
        status: 'Upcoming',
        eventNumber: wizardTrial.eventNumber || '',
        type: trialName,
        trialType: showType,
        plannedStartTime: wizardTrial.dateTime
          ? format(new Date(wizardTrial.dateTime), 'h:mm a')
          : '09:00 AM',
        order: String(index + 1),
      };
      const savedTrial = await addTrialToStore(newTrial, user?.id || 'unknown');
      trialIdMap[wizardTrial.id] = savedTrial.id;
    }

    return trialIdMap;
  }, [editMode, existingTrials, trials, addTrialToStore, user]);

  /**
   * Create classes for trials
   */
  const createClasses = useCallback((showId: string, trialIdMap: Record<string, string>) => {
    logger.debug('createClasses called', 'wizard', { showId, trialIdMap });

    const classesToCreate = createClassDataFromWizard(
      trials,
      trialIdMap,
      judgeDetails,
      showId,
      existingTrials,
      editMode
    );

    classesToCreate.forEach(classData => {
      logger.debug('Adding class', 'wizard', { classId: classData.id, className: classData.className });
      addClass(classData);
    });
  }, [trials, judgeDetails, existingTrials, editMode, addClass]);

  /**
   * Main save/create function - handles all save operations
   */
  const saveShow = useCallback(async (status: ShowStatus, shouldResetWizard: boolean) => {
    try {
      setIsLoading(true);
      logger.debug(`Saving show with status: ${status}`, 'wizard');

      // Transform wizard data to Show format
      const wizardShow = transformWizardDataToShow(
        show,
        trials,
        judgeDetails,
        clubs,
        status,
        editMode
      );

      // Save to show store and get the real DB UUID back
      let savedShow: Show;
      if (editMode?.showId) {
        const updated = await updateShow(editMode.showId, showToShowInput(wizardShow));
        savedShow = updated || wizardShow;
      } else {
        savedShow = await addShow(showToShowInput(wizardShow));
      }

      const realShowId = savedShow.id;

      // Create trials (awaited) and get wizard-ID → real-UUID mapping
      const trialIdMap = await createTrials(realShowId, savedShow.name, savedShow.type);

      // Create classes using the real trial UUIDs
      createClasses(realShowId, trialIdMap);

      // Save progress to wizard store if draft
      if (status === 'draft') {
        saveProgress();
      } else if (shouldResetWizard) {
        resetWizard();
      }

      // Navigate to the new show using the real DB UUID
      navigate(`/shows/${realShowId}`);

      logger.info(`Show saved successfully (${status})`, 'wizard', {
        showId: realShowId,
        showName: savedShow.name,
      });
    } catch (error) {
      logger.error('Error saving show', 'wizard', {}, error as Error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [
    show,
    trials,
    judgeDetails,
    clubs,
    editMode,
    addShow,
    updateShow,
    createTrials,
    createClasses,
    saveProgress,
    resetWizard,
    navigate,
    setIsLoading,
  ]);

  /**
   * Save as draft
   */
  const handleSaveDraft = useCallback(async () => {
    await saveShow('draft', false);
  }, [saveShow]);

  /**
   * Create show (unpublished)
   */
  const handleCreateShow = useCallback(async () => {
    await saveShow('unpublished', true);
  }, [saveShow]);

  /**
   * Create and publish show
   */
  const handleCreateAndPublish = useCallback(async () => {
    await saveShow('published', true);
  }, [saveShow]);

  /**
   * Save progress without navigating
   */
  const handleSaveProgress = useCallback(async () => {
    setIsLoading(true);
    try {
      saveProgress();
      logger.debug('Draft saved successfully', 'wizard');
    } catch (error) {
      logger.error('Error saving draft', 'wizard', {}, error as Error);
    } finally {
      setIsLoading(false);
    }
  }, [saveProgress, setIsLoading]);

  return {
    handleSaveDraft,
    handleCreateShow,
    handleCreateAndPublish,
    handleSaveProgress,
  };
}
