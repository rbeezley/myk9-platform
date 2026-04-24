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
import { supabase } from '@/services/database/supabaseClient';
import type { SportClassRuleRow } from '@/types/sport-template-types';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useReplicationSync } from '@/hooks/useReplicationSync';
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
import { saveShowAtomicOnline } from './saveShowAtomicOnline';
import { buildRuleMap } from './buildRuleMap';

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
  const { addShow, updateShow, deleteShowCascading } = useShowStore();
  const { clubs } = useClubStore();
  const { addTrial: addTrialToStore, trials: existingTrials, loadTrialClasses } = useTrialStore();
  const { classes: existingDBClasses } = useClassStoreCompat();
  const { user } = useAuthContext();
  const { isOnline } = useNetworkStatus();
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

      // Create trials sequentially — parallel Promise.all would leave a
      // partially-populated trialIdMap if one insert fails, causing classes
      // for the failed trial to be silently dropped with no trialId.
      for (const [index, wizardTrial] of trialsToAdd.entries()) {
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
      }

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
        editMode,
        { preEntryFee: show.preEntryFee, dayOfShowFee: show.dayOfShowFee }
      );

      // In add-classes mode, trial.classes includes both existing and new classes.
      // Filter out classes that already exist in the DB to avoid duplicates.
      let classesToCreate = allClasses;
      if (editMode?.mode === 'add-classes') {
        const existingClassKeys = new Set(
          existingDBClasses.map(c => `${c.trialId}|${c.element}|${c.level}|${c.section ?? ''}`)
        );
        classesToCreate = allClasses.filter(
          c => !existingClassKeys.has(`${c.trialId}|${c.element}|${c.level}|${c.section ?? ''}`)
        );
        logger.debug('Filtered existing classes for add-classes mode', 'wizard', {
          total: allClasses.length,
          new: classesToCreate.length,
          existing: allClasses.length - classesToCreate.length,
        });
      }

      const ruleMap = await buildRuleMap(classesToCreate.map(c => c.templateId ?? ''));

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
    // show.dayOfShowFee / show.preEntryFee intentionally excluded — fee changes
    // should not invalidate already-built class arrays mid-wizard.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

      let createdShowId: string | undefined;

      try {
        setIsLoading(true);

        // New-show + online path: single atomic RPC
        // (create_show_with_children, migration 145) writes shows + trials +
        // classes + judge_assignments in one transaction. Replaces the legacy
        // multi-step flow below, which could leave orphaned rows on partial
        // failure. Edit-mode and offline paths still use the multi-step flow.
        if (!editMode?.showId && isOnline) {
          const { showId: realShowId, savedShow } = await saveShowAtomicOnline({
            show,
            trials,
            judgeDetails,
            clubs,
            status,
            queryClient,
            triggerSync,
          });

          loadTrialClasses().catch(() => {
            /* non-critical */
          });

          if (status === 'draft') {
            saveProgress();
          } else if (shouldResetWizard) {
            resetWizard();
          }

          if (status === 'draft') {
            navigate(`/shows/${realShowId}`);
          } else if (onCreatedRef.current) {
            onCreatedRef.current(realShowId, savedShow.name);
          } else {
            navigate('/secretary/dashboard');
          }

          if (status === 'draft') {
            notifications.success(`"${savedShow.name}" saved as draft`);
          } else if (!onCreatedRef.current) {
            notifications.success(`"${savedShow.name}" created successfully`);
          }

          logger.info(`Show saved successfully (${status})`, 'wizard', {
            showId: realShowId,
            showName: savedShow.name,
          });
          return;
        }

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
          createdShowId = savedShow.id;
        }

        const realShowId = savedShow.id;

        // Seed React Query cache so pages find the show immediately while sync runs
        queryClient.setQueryData<Show>(showQueryKeys.detail(realShowId), savedShow);
        queryClient.setQueryData<Show[]>(showQueryKeys.lists(), old => {
          if (!old) return [savedShow];
          const exists = old.some(s => s.id === realShowId);
          return exists ? old.map(s => (s.id === realShowId ? savedShow : s)) : [savedShow, ...old];
        });

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

        // Grant official roles scoped to the show via the grant_show_official
        // RPC (migration 144). The RPC is SECURITY DEFINER and runs the
        // authorization check + club_id lookup server-side, bypassing the
        // user_roles RLS gate that previously silently rejected every grant.
        // Fire-and-forget so this doesn't block navigation, but surface a toast
        // if any grants fail so the bug isn't hidden again.
        const officialGrants = [
          ...show.officials.secretary.map(id => ({ id, role: UserRole.SECRETARY })),
          ...show.officials.chairman.map(id => ({ id, role: UserRole.CHAIRMAN })),
          ...show.officials.steward.map(id => ({ id, role: UserRole.STEWARD })),
        ];

        Promise.allSettled(
          officialGrants.map(async grant => {
            const { error } = await supabase.rpc('grant_show_official', {
              p_person_id: grant.id,
              p_role_name: grant.role,
              p_show_id: realShowId,
            });
            if (error) throw error;
          })
        ).then(results => {
          const failures = results.filter(r => r.status === 'rejected');
          failures.forEach(r => {
            const err = (r as PromiseRejectedResult).reason;
            logger.warn('Failed to auto-grant official role', 'wizard', {
              error: err instanceof Error ? err.message : String(err),
            });
          });
          if (failures.length > 0) {
            notifications.warning(
              `Show created, but ${failures.length} official role ${failures.length === 1 ? 'grant' : 'grants'} failed. Check the Officials tab to verify assignments.`
            );
          }
          queryClient.invalidateQueries({ queryKey: ['shows', realShowId, 'officials'] });
        });

        // Second sync pass to flush the child INSERTs (trials/classes) we just
        // queued. Fire-and-forget — any failure flows through the global
        // `replication:sync-failed` toast listener.
        triggerSync().catch(syncError => {
          logger.warn('Post-create child sync failed', 'wizard', {
            error: syncError instanceof Error ? syncError.message : String(syncError),
          });
        });

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
        // Compensating soft-delete: if the show was created but trials/classes
        // failed, remove it so the user isn't left with an orphaned show.
        if (createdShowId) {
          // Sync-remove from Zustand first so the orphan doesn't linger in the
          // list if the server-side soft delete fails (e.g. network down).
          useShowStore.setState(s => ({
            shows: s.shows.filter(sh => sh.id !== createdShowId),
            selectedShowId: s.selectedShowId === createdShowId ? '' : s.selectedShowId,
          }));
          deleteShowCascading(createdShowId).catch(deleteErr => {
            logger.warn('Compensating show delete failed after partial creation', 'wizard', {
              showId: createdShowId,
              error: deleteErr instanceof Error ? deleteErr.message : String(deleteErr),
            });
          });
          queryClient.removeQueries({ queryKey: showQueryKeys.detail(createdShowId) });
          queryClient.invalidateQueries({ queryKey: showQueryKeys.lists() });
        }
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
      deleteShowCascading,
      createTrials,
      createClasses,
      saveProgress,
      resetWizard,
      navigate,
      queryClient,
      triggerSync,
      isOnline,
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
