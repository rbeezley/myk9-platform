/**
 * Custom hook for Show Creation Wizard actions
 * Handles save, create, and publish operations
 */

import { useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { logger } from '@/services/LoggingService';
import { notifications } from '@/lib/notifications';
import { useWizardStore } from '@/store/wizardStore';
import { useShowStore } from '@/store/showStore';
import { useClubStore } from '@/store/clubStore';
import { useTrialStore, type TrialInput } from '@/store/trialStore';
import {
  replicatedClassesTable,
  type ReplicatedClass,
} from '@/services/replication/ReplicatedClassesTable';
import { replicatedShowsTable } from '@/services/replication/ReplicatedShowsTable';
import { supabase } from '@/services/database/supabaseClient';
import { fetchClassRulesForTemplate } from '@/services/sportTemplateService';
import type { SportClassRuleRow } from '@/types/sport-template-types';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useReplicationSync } from '@/hooks/useReplicationSync';
import { rbacService } from '@/services/rbac';
import { UserRole } from '@/types/auth-types';
import { showQueryKeys } from '@/hooks/queries/useShowsDatabase';
import { persistShowJudgeAssignments } from '@/services/database/queries/judgeQueries';
import type { Show } from '@/types/show-types';
import type { EditMode, ShowStatus } from './show-creation-wizard-types';
import type { ClassData } from '@/components/classes/types/classTypes';
import { useClassStoreCompat } from '@/hooks/useClassStoreCompat';
import {
  createClassDataFromWizard,
  showToShowInput,
  transformWizardDataToShow,
} from './showCreationWizardTransformers';

/**
 * Verify a newly-created show actually landed on the server after sync.
 * If the row is missing (e.g., RLS rejected the INSERT), roll back the local
 * optimistic state so the UI doesn't show a ghost record and throw a clear
 * error for the caller to surface to the user.
 *
 * Exported for unit testing.
 */
export async function verifyShowCreatedOnServer(deps: {
  showId: string;
  supabase: typeof import('@/services/database/supabaseClient').supabase;
  replicatedShowsTable: typeof import('@/services/replication/ReplicatedShowsTable').replicatedShowsTable;
  removeShow: (id: string) => void;
  queryClient: import('@tanstack/react-query').QueryClient;
}): Promise<void> {
  const { data: serverRow, error: verifyError } = await deps.supabase
    .from('shows')
    .select('id')
    .eq('id', deps.showId)
    .maybeSingle();

  if (verifyError || !serverRow) {
    deps.removeShow(deps.showId);
    await deps.replicatedShowsTable.delete(deps.showId);
    deps.queryClient.removeQueries({ queryKey: showQueryKeys.detail(deps.showId) });
    deps.queryClient.setQueryData<Show[]>(showQueryKeys.lists(), old =>
      old ? old.filter(s => s.id !== deps.showId) : []
    );
    throw new Error(
      verifyError?.message ||
        'Show was not saved. You may not have permission to create shows for this club.'
    );
  }
}

/**
 * Convert wizard ClassData to ReplicatedClass for offline-first storage
 */
function classDataToReplicatedClass(
  classData: ClassData,
  rule?: SportClassRuleRow
): ReplicatedClass {
  return {
    id: classData.id || crypto.randomUUID(),
    trialId: classData.trialId,
    name: classData.className || classData.trial || 'Class',
    level: classData.level,
    element: classData.element,
    section: classData.section,
    entryFee: classData.preEntryFee || classData.entryFee,
    maxEntries: classData.maxEntries,
    judgeName: classData.judge,
    classOrder: classData.classOrder ? parseInt(classData.classOrder, 10) : undefined,
    classStatus: classData.status || 'Scheduled',
    startTime: classData.startTime,
    // Keep snake_case alias for backward compat
    trial_id: classData.trialId,
    // Scoring rule fields (from sport_class_rules, baked in at creation)
    ...(rule && {
      timerMode: rule.timer_mode,
      hidesKnown: rule.hides_known,
      distractionCount: rule.distraction_count_min,
      areaCount: rule.area_count,
      timeLimitSeconds: rule.max_time_seconds_fixed ?? undefined,
    }),
  };
}

interface UseShowCreationWizardActionsOptions {
  editMode?: EditMode | undefined;
  setIsLoading: (loading: boolean) => void;
  onCreated?: (showId: string, showName: string) => void;
}

export function useShowCreationWizardActions({
  editMode,
  setIsLoading,
  onCreated,
}: UseShowCreationWizardActionsOptions) {
  const isSavingRef = useRef(false);
  // Keep a stable ref so saveShow's useCallback doesn't need to re-run when the
  // parent's inline onCreated arrow changes reference on every render.
  const onCreatedRef = useRef(onCreated);
  onCreatedRef.current = onCreated;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { show, trials, judgeDetails, saveProgress, resetWizard } = useWizardStore();
  const { addShow, updateShow } = useShowStore();
  const { clubs } = useClubStore();
  const { addTrial: addTrialToStore, trials: existingTrials, loadTrialClasses } = useTrialStore();
  const { classes: existingDBClasses } = useClassStoreCompat();
  const { user } = useAuthContext();
  const { triggerSync } = useReplicationSync();

  /**
   * Create trials in the trial store
   * Returns a map from wizard trial ID to actual DB UUID
   */
  const createTrials = useCallback(
    async (
      showId: string,
      showName: string,
      showOrganization: string
    ): Promise<Record<string, string>> => {
      const trialIdMap: Record<string, string> = {};

      // In edit mode, only add trials that don't already exist
      const trialsToAdd = editMode
        ? (() => {
            const existingTrialIds = existingTrials.filter(t => t.showId === showId).map(t => t.id);
            return trials.filter(wizardTrial => !existingTrialIds.includes(wizardTrial.id));
          })()
        : trials;

      // Also map existing trials (edit mode) to themselves
      if (editMode) {
        const existingTrialIds = existingTrials.filter(t => t.showId === showId).map(t => t.id);
        trials.forEach(wizardTrial => {
          if (existingTrialIds.includes(wizardTrial.id)) {
            trialIdMap[wizardTrial.id] = wizardTrial.id;
          }
        });
      }

      // Create new trials in parallel and collect their real UUIDs
      await Promise.all(
        trialsToAdd.map(async (wizardTrial, index) => {
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
            trialType: wizardTrial.trialType || showOrganization,
            plannedStartTime: wizardTrial.dateTime
              ? format(new Date(wizardTrial.dateTime), 'h:mm a')
              : '09:00 AM',
            order: String(index + 1),
          };
          const savedTrial = await addTrialToStore(newTrial, user?.id || 'unknown');
          trialIdMap[wizardTrial.id] = savedTrial.id;
        })
      );

      return trialIdMap;
    },
    [editMode, existingTrials, trials, addTrialToStore, user]
  );

  /**
   * Create classes for trials via offline-first replication.
   * Fetches sport_class_rules and bakes rule fields into each class record
   * so scoring works fully offline.
   */
  const createClasses = useCallback(
    async (showId: string, trialIdMap: Record<string, string>) => {
      logger.debug('createClasses called', 'wizard', { showId, trialIdMap });

      const allClasses = createClassDataFromWizard(
        trials,
        trialIdMap,
        judgeDetails,
        showId,
        existingTrials,
        editMode
      );

      // In add-classes mode, trial.classes includes both existing and new classes.
      // Filter out classes that already exist in the DB to avoid duplicates.
      let classesToCreate = allClasses;
      if (editMode?.mode === 'add-classes') {
        const existingClassNames = new Set(
          existingDBClasses.map(c => `${c.trialId}|${c.className}`)
        );
        classesToCreate = allClasses.filter(
          c => !existingClassNames.has(`${c.trialId}|${c.className}`)
        );
        logger.debug('Filtered existing classes for add-classes mode', 'wizard', {
          total: allClasses.length,
          new: classesToCreate.length,
          existing: allClasses.length - classesToCreate.length,
        });
      }

      // Build a lookup map of sport_class_rules by (templateId, element, level)
      // so we can bake rule fields into each class record at creation time.
      const ruleMap = new Map<string, SportClassRuleRow>();
      const templateIds = new Set(
        classesToCreate.map(c => c.templateId).filter((id): id is string => Boolean(id))
      );

      await Promise.all(
        [...templateIds].map(async templateId => {
          try {
            const rules = await fetchClassRulesForTemplate(templateId);
            for (const rule of rules) {
              const key = `${templateId}|${rule.element}|${rule.level ?? ''}`;
              ruleMap.set(key, rule);
            }
          } catch (err) {
            logger.warn('Failed to fetch rules for template', 'wizard', {
              templateId,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        })
      );

      await Promise.all(
        classesToCreate.map(classData => {
          const rule = classData.templateId
            ? ruleMap.get(
                `${classData.templateId}|${classData.element ?? ''}|${classData.level ?? ''}`
              )
            : undefined;
          return replicatedClassesTable.createClass(classDataToReplicatedClass(classData, rule));
        })
      );

      logger.debug(`Created ${classesToCreate.length} classes`, 'wizard');
    },
    [trials, judgeDetails, existingTrials, editMode, existingDBClasses]
  );

  /**
   * Main save/create function - handles all save operations
   */
  const saveShow = useCallback(
    async (status: ShowStatus, shouldResetWizard: boolean) => {
      // Prevent double submission
      if (isSavingRef.current) return;
      isSavingRef.current = true;

      try {
        setIsLoading(true);

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
        const trialIdMap = await createTrials(realShowId, savedShow.name, savedShow.organization);

        // Create classes using the real trial UUIDs (await for offline-first storage)
        await createClasses(realShowId, trialIdMap);

        // Persist judge assignments to judge_assignments table
        const judges = wizardShow.assignedJudges || [];
        if (judges.length > 0) {
          try {
            await persistShowJudgeAssignments(realShowId, judges, {
              skipDelete: !editMode?.showId,
            });
          } catch (judgeError) {
            logger.warn('Failed to persist judge assignments', 'wizard', {
              error: judgeError instanceof Error ? judgeError.message : String(judgeError),
            });
          }
        }

        // Grant official roles scoped to the show — fire-and-forget so this doesn't
        // block navigation. Invalidate the officials cache after all grants settle.
        const officialGrants = [
          ...show.officials.secretary.map(id => ({ id, role: UserRole.SECRETARY })),
          ...show.officials.chairman.map(id => ({ id, role: UserRole.CHAIRMAN })),
          ...show.officials.steward.map(id => ({ id, role: UserRole.STEWARD })),
        ];

        Promise.allSettled(
          officialGrants.map(grant =>
            rbacService.ensureUserHasRole(grant.id, grant.role, { showId: realShowId }).catch(err =>
              logger.warn('Failed to auto-grant official role', 'wizard', {
                personId: grant.id,
                role: grant.role,
                error: err instanceof Error ? err.message : String(err),
              })
            )
          )
        ).then(() => {
          queryClient.invalidateQueries({ queryKey: ['shows', realShowId, 'officials'] });
        });

        // Seed React Query cache so pages find the show immediately while sync runs
        queryClient.setQueryData<Show>(showQueryKeys.detail(realShowId), savedShow);
        queryClient.setQueryData<Show[]>(showQueryKeys.lists(), old => {
          if (!old) return [savedShow];
          const exists = old.some(s => s.id === realShowId);
          return exists ? old.map(s => (s.id === realShowId ? savedShow : s)) : [savedShow, ...old];
        });

        // Trigger sync and AWAIT it so we can verify the show landed on the
        // server before navigating to the success screen. For new shows, we
        // then re-read the row from the server to gate the "Show Created!"
        // confetti/access-code overlay on a confirmed INSERT — otherwise an
        // RLS rejection (or any silent upload failure) would leave the UI
        // lying about success while the row never persisted.
        await triggerSync();

        if (!editMode?.showId) {
          await verifyShowCreatedOnServer({
            showId: realShowId,
            supabase,
            replicatedShowsTable,
            removeShow: useShowStore.getState().removeShow,
            queryClient,
          });
        }

        // Reload trial classes in background — don't block navigation
        loadTrialClasses().catch(() => {
          /* non-critical */
        });

        // Invalidate schedule timeline cache so the overview page shows new trials/classes
        queryClient.invalidateQueries({ queryKey: ['shows', realShowId, 'schedule-timeline'] });

        // Save progress to wizard store if draft
        if (status === 'draft') {
          saveProgress();
        } else if (shouldResetWizard) {
          resetWizard();
        }

        // Navigate: drafts go to show detail, created shows go to pipeline (mission control)
        if (status === 'draft') {
          navigate(`/shows/${realShowId}`);
        } else if (onCreatedRef.current) {
          onCreatedRef.current(realShowId, savedShow.name);
        } else {
          navigate('/secretary/dashboard');
        }

        // Show success toast (skip for non-draft when the success overlay is shown instead)
        if (status === 'draft') {
          notifications.success(`"${savedShow.name}" saved as draft`);
        } else if (!onCreatedRef.current) {
          notifications.success(`"${savedShow.name}" created successfully`);
        }

        logger.info(`Show saved successfully (${status})`, 'wizard', {
          showId: realShowId,
          showName: savedShow.name,
        });
      } catch (error) {
        logger.error('Error saving show', 'wizard', {}, error as Error);
        notifications.error(
          error instanceof Error
            ? `Failed to create show: ${error.message}`
            : 'Failed to create show. Please try again.'
        );
      } finally {
        setIsLoading(false);
        isSavingRef.current = false;
      }
    },
    [
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
      queryClient,
      triggerSync,
      setIsLoading,
      loadTrialClasses,
    ]
  );

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
