import type { QueryClient } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { replicatedShowsTable } from '@/services/replication/ReplicatedShowsTable';
import { replicatedTrialsTable } from '@/services/replication/ReplicatedTrialsTable';
import { replicatedClassesTable } from '@/services/replication/ReplicatedClassesTable';
import { useShowStore } from '@/store/showStore';
import { showQueryKeys } from '@/hooks/queries/useShowsDatabase';
import { logger } from '@/services/LoggingService';
import { UserRole } from '@/types/auth-types';
import type { Show } from '@/types/show-types';
import type { Club } from '@/types/club-types';
import type { JudgeDetailsMap } from './show-creation-wizard-types';
import { buildCreateShowPayload } from './buildCreateShowPayload';
import { buildRuleMap } from './buildRuleMap';
import type { WizardShowData, WizardTrial } from './showCreationWizardTransformers';

export interface SaveShowAtomicOnlineArgs {
  show: WizardShowData;
  trials: WizardTrial[];
  judgeDetails: JudgeDetailsMap;
  clubs: Club[];
  status: string;
  queryClient: QueryClient;
  triggerSync: () => Promise<unknown>;
}

export interface SaveShowAtomicOnlineResult {
  showId: string;
  savedShow: Show;
}

function joinAddress(club: Club | undefined): string {
  if (!club) return '';
  const a = club.address;
  return [a.street, a.city, a.state, a.zipCode].filter(Boolean).join(', ');
}

/**
 * Online new-show path: atomic RPC create_show_with_children + local cache seed.
 * Throws on RPC failure (caller handles toast + rollback via `throw`).
 * Post-RPC IndexedDB writes are best-effort — failures trigger a sync instead
 * of surfacing to the user, because the show already exists server-side.
 */
export async function saveShowAtomicOnline(
  args: SaveShowAtomicOnlineArgs
): Promise<SaveShowAtomicOnlineResult> {
  const { show, trials, judgeDetails, clubs, status, queryClient, triggerSync } = args;

  const ruleMap = await buildRuleMap(trials.flatMap(t => t.classes.map(c => c.templateId)));

  const { rpcInput, localEntities, showId } = buildCreateShowPayload(
    show,
    trials,
    judgeDetails,
    ruleMap,
    status
  );

  // `create_show_with_children` is defined in migration 145; cast the RPC
  // name until the Supabase type generator picks it up post-deploy.
  // TODO: drop the cast after `supabase gen types typescript` runs.
  const { error: rpcError } = await (
    supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>
    ) => Promise<{ error: { message: string } | null }>
  )('create_show_with_children', rpcInput as unknown as Record<string, unknown>);
  if (rpcError) {
    throw new Error(rpcError.message);
  }

  try {
    await Promise.all([
      replicatedShowsTable.set(showId, localEntities.show, false),
      ...localEntities.trials.map(t => replicatedTrialsTable.set(t.id, t, false)),
      ...localEntities.classes.map(c => replicatedClassesTable.set(c.id, c, false)),
    ]);
  } catch (cacheError) {
    logger.warn('Post-RPC IndexedDB seed failed — triggering sync', 'wizard', {
      showId,
      error: cacheError instanceof Error ? cacheError.message : String(cacheError),
    });
    triggerSync().catch(() => {
      /* best-effort */
    });
  }

  const selectedClub = clubs.find(c => c.id === show.clubId);
  const savedShow: Show = {
    id: showId,
    name: show.name,
    organization: show.organization,
    startDate: show.startDate,
    endDate: show.endDate,
    location: show.location || '',
    status: localEntities.show.status || 'draft',
    events: [],
    source: 'myK9Show',
    entryOpenDate: show.entryOpenDate || '',
    entryCloseDate: show.entryCloseDate || '',
    preEntryFee: String(show.preEntryFee || 0),
    dayOfShowFee: String(show.dayOfShowFee || 0),
    clubId: show.clubId,
    clubName: selectedClub?.name || '',
    clubAddress: joinAddress(selectedClub),
    clubEmail: selectedClub?.email || '',
    logoUrl: selectedClub?.logo || '',
    coverImageUrl: selectedClub?.coverImage || '',
    accentColor: selectedClub?.accentColor || '',
    assignedJudges: show.judgeIds.map(judgeId => ({
      judgeId,
      judgeName: judgeDetails[judgeId]?.name || 'Unknown Judge',
      assignedDate: new Date().toISOString().split('T')[0]!,
    })),
    stats: [],
    trials: [],
    startingArmbandNumber: show.startingArmbandNumber,
    acceptCheckPayments: show.acceptCheckPayments,
    acceptCashPayments: show.acceptCashPayments,
  };

  useShowStore.getState().addShowLegacy(savedShow);

  queryClient.setQueryData<Show>(showQueryKeys.detail(showId), savedShow);
  queryClient.setQueryData<Show[]>(showQueryKeys.lists(), old => {
    if (!old) return [savedShow];
    return old.some(s => s.id === showId)
      ? old.map(s => (s.id === showId ? savedShow : s))
      : [savedShow, ...old];
  });

  // Fire-and-forget role grants. Failures are logged and the officials query
  // is invalidated either way, so downstream UI refreshes without waiting.
  const officialGrants = [
    ...show.officials.secretary.map(id => ({ id, role: UserRole.SECRETARY })),
    ...show.officials.chairman.map(id => ({ id, role: UserRole.CHAIRMAN })),
    ...show.officials.steward.map(id => ({ id, role: UserRole.STEWARD })),
  ];
  void Promise.allSettled(
    officialGrants.map(async grant => {
      const { error } = await supabase.rpc('grant_show_official', {
        p_person_id: grant.id,
        p_role_name: grant.role,
        p_show_id: showId,
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
    queryClient.invalidateQueries({ queryKey: ['shows', showId, 'officials'] });
  });

  queryClient.invalidateQueries({ queryKey: ['shows', showId, 'schedule-timeline'] });

  return { showId, savedShow };
}
