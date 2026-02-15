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
  buildTrialIdMapping,
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
   */
  const createTrials = useCallback((newShow: Show) => {
    // In edit mode, only add trials that don't already exist
    const trialsToAdd = editMode
      ? (() => {
          const existingTrialIds = existingTrials
            .filter(t => t.showId === newShow.id)
            .map(t => t.id);
          return trials.filter(wizardTrial => !existingTrialIds.includes(wizardTrial.id));
        })()
      : trials;

    trialsToAdd.forEach((wizardTrial, index) => {
      const trialName = wizardTrial.name || `Trial ${index + 1}`;
      const newTrial: TrialInput = {
        showId: newShow.id,
        showName: newShow.name,
        name: trialName,
        trialDate: wizardTrial.dateTime,
        trialNumber: trialName,
        status: 'Upcoming',
        eventNumber: wizardTrial.eventNumber || '',
        type: trialName,
        trialType: newShow.type,
        plannedStartTime: wizardTrial.dateTime
          ? format(new Date(wizardTrial.dateTime), 'h:mm a')
          : '09:00 AM',
        order: String(index + 1),
      };
      addTrialToStore(newTrial, user?.id || 'unknown');
    });
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
      const newShow = transformWizardDataToShow(
        show,
        trials,
        judgeDetails,
        clubs,
        status,
        editMode
      );

      // Save to show store (add or update based on mode)
      if (editMode?.showId) {
        updateShow(editMode.showId, showToShowInput(newShow));
      } else {
        addShow(showToShowInput(newShow));
      }

      // Create trials in trial store
      createTrials(newShow);

      // Build trial ID mapping and create classes
      const trialIdMap = buildTrialIdMapping(
        trials,
        newShow.id,
        existingTrials,
        editMode
      );

      // Wait for trials to be saved before creating classes
      setTimeout(() => {
        createClasses(newShow.id, trialIdMap);
      }, 1000);

      // Save progress to wizard store if draft
      if (status === 'draft') {
        saveProgress();
      } else if (shouldResetWizard) {
        resetWizard();
      }

      // Navigate to the new show
      navigate(`/shows/${newShow.id}`);

      logger.info(`Show saved successfully (${status})`, 'wizard', {
        showId: newShow.id,
        showName: newShow.name,
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
    existingTrials,
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
