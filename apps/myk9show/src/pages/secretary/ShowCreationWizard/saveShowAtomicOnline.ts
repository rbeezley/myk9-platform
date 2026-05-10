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
import type { JudgeDetailsMap, ShowStatus } from './show-creation-wizard-types';
import { buildCreateShowPayload } from './buildCreateShowPayload';
import { buildRuleMap } from './buildRuleMap';
import { formatClubAddress } from '@/utils/clubAddress';
import { resolvePremiumStyle, type PremiumStyle } from '@/types/premium-types';
import type { WizardShowData, WizardTrial } from './showCreationWizardTransformers';

export interface SaveShowAtomicOnlineArgs {
  show: WizardShowData;
  trials: WizardTrial[];
  judgeDetails: JudgeDetailsMap;
  clubs: Club[];
  status: ShowStatus;
  queryClient: QueryClient;
  triggerSync: () => Promise<unknown>;
}

export interface SaveShowAtomicOnlineResult {
  showId: string;
  savedShow: Show;
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
    preEntryFee: String(show.preEntryFee ?? 0),
    dayOfShowFee: String(show.dayOfShowFee ?? 0),
    clubId: show.clubId,
    clubName: selectedClub?.name || '',
    clubAddress: formatClubAddress(selectedClub),
    clubEmail: selectedClub?.email || '',
    logoUrl: selectedClub?.logo || '',
    coverImageUrl: selectedClub?.coverImage || '',
    accentColor: selectedClub?.accentColor || '',
    assignedJudges: (show.judgeIds ?? []).map(judgeId => ({
      judgeId,
      judgeName: judgeDetails[judgeId]?.name || 'Unknown Judge',
      assignedDate: new Date().toISOString().split('T')[0]!,
    })),
    stats: [],
    trials: [],
    startingArmbandNumber: show.startingArmbandNumber,
    acceptCheckPayments: show.acceptCheckPayments,
    acceptCashPayments: show.acceptCashPayments,
    style: resolvePremiumStyle(localEntities.show.style as PremiumStyle | undefined),
  };

  const { shows, addShowLegacy } = useShowStore.getState();
  if (!shows.some(s => s.id === showId)) {
    addShowLegacy(savedShow);
  }

  queryClient.setQueryData<Show>(showQueryKeys.detail(showId), savedShow);
  queryClient.setQueryData<Show[]>(showQueryKeys.lists(), old => {
    if (!old) return [savedShow];
    return old.some(s => s.id === showId)
      ? old.map(s => (s.id === showId ? savedShow : s))
      : [savedShow, ...old];
  });

  // Block on official-role grants. A show without its mandatory officials is
  // a worse end state than a failed save — the secretary loses access, the
  // generated premium has no contact info, and the failure mode is silent.
  // Throw if any grant fails so the wizard's catch block surfaces a real error.
  const officialGrants = [
    ...(show.officials.secretary ?? []).map(id => ({ id, role: UserRole.SECRETARY })),
    ...(show.officials.chairman ?? []).map(id => ({ id, role: UserRole.CHAIRMAN })),
    ...(show.officials.steward ?? []).map(id => ({ id, role: UserRole.STEWARD })),
  ];
  const grantResults = await Promise.allSettled(
    officialGrants.map(async grant => {
      const { error } = await supabase.rpc('grant_show_official', {
        p_person_id: grant.id,
        p_role_name: grant.role,
        p_show_id: showId,
      });
      if (error) throw error;
    })
  );
  const grantFailures = grantResults.filter(r => r.status === 'rejected');
  grantFailures.forEach(r => {
    const err = (r as PromiseRejectedResult).reason;
    logger.warn('Failed to grant official role', 'wizard', {
      error: err instanceof Error ? err.message : String(err),
    });
  });
  queryClient.invalidateQueries({ queryKey: ['shows', showId, 'officials'] });
  if (grantFailures.length > 0) {
    throw new Error(
      `Failed to assign ${grantFailures.length} official role${grantFailures.length === 1 ? '' : 's'}. The show was created but officials could not be set — please retry or assign them manually via the Officials tab.`
    );
  }

  queryClient.invalidateQueries({ queryKey: ['shows', showId, 'schedule-timeline'] });

  return { showId, savedShow };
}
