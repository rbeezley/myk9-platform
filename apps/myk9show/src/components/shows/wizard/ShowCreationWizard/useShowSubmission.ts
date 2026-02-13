import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { logger } from '@/services/LoggingService';
import { useWizardStore } from '@/store/wizardStore';
import { useShowStore, type ShowInput } from '@/store/showStore';
import { useClubStore } from '@/store/clubStore';
import { useTrialStore, type TrialInput } from '@/store/trialStore';
import { useClassStoreCompat } from '@/hooks/useClassStoreCompat';
import type { Show } from '@/types/show-types';
import type { ClassData } from '@/components/classes/types/classTypes';
import type { EditMode } from './types';

// ---------------------------------------------------------------------------
// Internal helpers (pure functions, no hooks)
// ---------------------------------------------------------------------------

function showToShowInput(show: Show): ShowInput {
  return {
    name: show.name,
    type: show.type,
    startDate: show.startDate,
    endDate: show.endDate,
    location: show.location,
    status: show.status,
    events: show.events,
    source: show.source,
    entryOpenDate: show.entryOpenDate,
    entryCloseDate: show.entryCloseDate,
    preEntryFee: show.preEntryFee,
    dayOfShowFee: show.dayOfShowFee,
    clubId: show.clubId,
    clubName: show.clubName,
    clubAddress: show.clubAddress,
    clubEmail: show.clubEmail,
    chairman: show.chairman,
    secretary: show.secretary,
    chiefSteward: show.chiefSteward,
    assignedJudges: show.assignedJudges,
    trials: show.trials,
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

type WizardTrials = ReturnType<typeof useWizardStore.getState>['trials'];

export interface UseShowSubmissionReturn {
  handleSaveDraftClick: () => Promise<void>;
  handleCreateShowClick: () => Promise<void>;
  handleCreateAndPublishClick: () => Promise<void>;
}

export function useShowSubmission(
  editMode: EditMode | undefined,
  setIsLoading: (v: boolean) => void,
  onOpenChange: (open: boolean) => void,
): UseShowSubmissionReturn {
  const navigate = useNavigate();

  const {
    show,
    trials,
    judgeDetails,
    saveProgress,
    resetWizard,
  } = useWizardStore();

  const { addShow, updateShow } = useShowStore();
  const { clubs } = useClubStore();
  const { addTrial: addTrialToStore, trials: existingTrials } = useTrialStore();
  const { addClass } = useClassStoreCompat();

  // ---- Transform wizard data into a Show object ----
  const transformWizardDataToShow = useCallback(
    (status: 'draft' | 'unpublished' | 'published'): Show => {
      const showId = editMode
        ? editMode.showId
        : (() => {
            const timestamp = Date.now();
            const randomSuffix = Math.floor(Math.random() * 1000);
            return `wizard-${timestamp}-${randomSuffix}`;
          })();

      const selectedClub = clubs.find(club => club.id === show.clubId);

      const assignedJudges = show.judgeIds.map(judgeId => {
        const judge = judgeDetails[judgeId];
        return {
          judgeId,
          judgeName: judge?.name || 'Unknown Judge',
          assignedDate: new Date().toISOString().split('T')[0],
          email: judge?.email,
          phone: judge?.phone,
        };
      });

      const showTrials = trials.map((trial, idx) => ({
        id: trial.id,
        name: trial.name,
        date: trial.dateTime,
        trialNumber: `${idx + 1}`,
        status: 'Upcoming',
      }));

      return {
        id: showId,
        name: show.name,
        type: show.type,
        startDate: show.startDate,
        endDate: show.endDate,
        location: show.location,
        status,
        events: [],
        source: 'myK9Show' as const,
        entryOpenDate: show.entryOpenDate,
        entryCloseDate: show.entryCloseDate,
        preEntryFee: show.preEntryFee.toString(),
        dayOfShowFee: show.dayOfShowFee.toString(),
        clubId: show.clubId,
        clubName: selectedClub?.name || 'Unknown Club',
        clubAddress: selectedClub
          ? [
              selectedClub.address.street,
              selectedClub.address.city,
              selectedClub.address.state,
              selectedClub.address.zipCode,
              selectedClub.address.country,
            ]
              .filter(Boolean)
              .join(', ')
          : '',
        clubEmail: selectedClub?.email || '',
        chairman: show.chairman,
        secretary: show.secretary,
        chiefSteward: '',
        assignedJudges,
        stats: [],
        trials: showTrials,
      };
    },
    [show, trials, judgeDetails, clubs, editMode],
  );

  // ---- Build a mapping from wizard trial IDs to persistent IDs ----
  const buildTrialIdMapping = useCallback(
    (wizardTrials: WizardTrials, showId: string): Record<string, string> => {
      const trialIdMap: Record<string, string> = {};
      const numericIds = existingTrials.map(t => parseInt(t.id)).filter(id => !isNaN(id));
      const baseId = numericIds.length > 0 ? Math.max(...numericIds) + 1 : 1;

      if (editMode) {
        const existingTrialIds = existingTrials.filter(t => t.showId === showId).map(t => t.id);
        let newTrialIndex = 0;
        wizardTrials.forEach(wizardTrial => {
          if (existingTrialIds.includes(wizardTrial.id)) {
            trialIdMap[wizardTrial.id] = wizardTrial.id;
          } else {
            trialIdMap[wizardTrial.id] = String(baseId + newTrialIndex);
            newTrialIndex++;
          }
        });
      } else {
        wizardTrials.forEach((wizardTrial, index) => {
          trialIdMap[wizardTrial.id] = String(baseId + index);
        });
      }

      return trialIdMap;
    },
    [editMode, existingTrials],
  );

  // ---- Create class records in the class store ----
  const createClassesWithTrialMapping = useCallback(
    (showId: string, trialIdMap: Record<string, string>) => {
      logger.debug('createClassesWithTrialMapping called', 'wizard', { showId, trialIdMap });

      const trialsToProcess = editMode
        ? (() => {
            const existingTrialIds = existingTrials.filter(t => t.showId === showId).map(t => t.id);
            return trials.filter(wt => !existingTrialIds.includes(wt.id));
          })()
        : trials;

      trialsToProcess.forEach(wizardTrial => {
        const trialId = trialIdMap[wizardTrial.id];
        logger.debug('Processing wizard trial', 'wizard', { trialName: wizardTrial.name, trialId });

        if (trialId && wizardTrial.classes.length > 0) {
          wizardTrial.classes.forEach((cls, index) => {
            const className = (cls.customizations?.className as string) || `Class ${index + 1}`;
            const element = (cls.customizations?.element as string) || 'Unknown';
            const level = (cls.customizations?.level as string) || 'Unknown';
            const classId = `${trialId}-class-${Date.now()}-${index}`;

            const classData: ClassData = {
              id: classId,
              trialId,
              trial: wizardTrial.name,
              trialDate: wizardTrial.dateTime,
              trialNumber: wizardTrial.eventNumber || wizardTrial.name,
              classOrder: String(index + 1),
              status: 'Scheduled' as const,
              judge: judgeDetails[cls.judgeId || '']?.name || 'TBD',
              element,
              level,
              section: (cls.customizations?.section as string) || 'A',
              hidesUsed: '0',
              distractionsUsed: '0',
              itemsUsed: '',
              timeLimit1: '3:00',
              timeLimit2: '',
              timeLimit3: '',
              photoUrl: '',
              className,
              entryFee: 30,
              preEntryFee: 30,
              dayOfShowFee: 35,
              maxEntries: 40,
              templateId: cls.templateId,
            };

            logger.debug('Adding class', 'wizard', { classData });
            addClass(classData);
          });
        } else if (!trialId) {
          logger.warn('No trial ID mapping found for wizard trial', 'wizard', {
            trialName: wizardTrial.name,
          });
        } else {
          logger.debug('Wizard trial has no classes', 'wizard', {
            trialName: wizardTrial.name,
          });
        }
      });
    },
    [trials, addClass, judgeDetails, editMode, existingTrials],
  );

  // ---- Persist trials into the trial store ----
  const persistTrials = useCallback(
    (newShow: Show) => {
      const trialsToCreate = editMode
        ? (() => {
            const existingTrialIds = existingTrials
              .filter(t => t.showId === newShow.id)
              .map(t => t.id);
            return trials.filter(wt => !existingTrialIds.includes(wt.id));
          })()
        : trials;

      trialsToCreate.forEach(wizardTrial => {
        const trialName = wizardTrial.name || `Trial ${trials.indexOf(wizardTrial) + 1}`;
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
          order: String(trials.indexOf(wizardTrial) + 1),
        };
        addTrialToStore(newTrial);
      });
    },
    [editMode, existingTrials, trials, addTrialToStore],
  );

  // ---- Shared submit logic ----
  const submitShow = useCallback(
    async (
      status: 'draft' | 'unpublished' | 'published',
      options: { resetAfter: boolean; saveDraftProgress: boolean; navigationDelay: number },
    ) => {
      const newShow = transformWizardDataToShow(status);

      // Save or update the show
      if (editMode?.showId) {
        updateShow(editMode.showId, showToShowInput(newShow));
      } else {
        addShow(showToShowInput(newShow));
      }

      // Persist trials
      persistTrials(newShow);

      // Create classes (delayed to ensure trials are persisted first)
      const trialIdMap = buildTrialIdMapping(trials, newShow.id);
      setTimeout(() => {
        createClassesWithTrialMapping(newShow.id, trialIdMap);
      }, 1000);

      // Post-save state management
      if (options.saveDraftProgress) {
        saveProgress();
      }
      if (options.resetAfter) {
        resetWizard();
      }

      onOpenChange(false);

      // Navigate after a short delay to allow persistence
      setTimeout(() => {
        navigate(`/shows/${newShow.id}`);
      }, options.navigationDelay);

      return newShow;
    },
    [
      transformWizardDataToShow,
      editMode,
      updateShow,
      addShow,
      persistTrials,
      buildTrialIdMapping,
      trials,
      createClassesWithTrialMapping,
      saveProgress,
      resetWizard,
      onOpenChange,
      navigate,
    ],
  );

  // ---- Public handlers ----

  const handleSaveDraftClick = useCallback(async () => {
    try {
      setIsLoading(true);
      logger.debug('Saving draft', 'wizard');

      const newShow = await submitShow('draft', {
        resetAfter: false,
        saveDraftProgress: true,
        navigationDelay: 500,
      });

      logger.info('Draft saved successfully', 'wizard', {
        showId: newShow.id,
        showName: newShow.name,
      });
    } catch (error) {
      logger.error('Error saving draft', 'wizard', {}, error as Error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [setIsLoading, submitShow]);

  const handleCreateShowClick = useCallback(async () => {
    try {
      setIsLoading(true);
      logger.debug('Creating show (unpublished)', 'wizard');

      const newShow = await submitShow('unpublished', {
        resetAfter: true,
        saveDraftProgress: false,
        navigationDelay: 100,
      });

      logger.info('Show created successfully (unpublished)', 'wizard', {
        showId: newShow.id,
        showName: newShow.name,
      });
    } catch (error) {
      logger.error('Error creating show', 'wizard', {}, error as Error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [setIsLoading, submitShow]);

  const handleCreateAndPublishClick = useCallback(async () => {
    try {
      setIsLoading(true);
      logger.debug('Creating and publishing show', 'wizard');

      const newShow = await submitShow('published', {
        resetAfter: true,
        saveDraftProgress: false,
        navigationDelay: 500,
      });

      logger.info('Show created and published successfully', 'wizard', {
        showId: newShow.id,
        showName: newShow.name,
      });
    } catch (error) {
      logger.error('Error creating and publishing show', 'wizard', {}, error as Error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [setIsLoading, submitShow]);

  return {
    handleSaveDraftClick,
    handleCreateShowClick,
    handleCreateAndPublishClick,
  };
}
