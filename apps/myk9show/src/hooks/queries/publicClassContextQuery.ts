import { useQuery } from '@tanstack/react-query';
import {
  GUEST_READ_QUERY_OPTIONS,
  resolveGuestRead,
  useQueryOnlineStatus,
  type GuestReadState,
} from '@/hooks/guestServerRead';
import { getClassesByTrialId, getPublicClassById } from '@/services/database/classes';
import { getPublicTrialsByShow } from '@/services/database/trials';
import {
  mapDatabaseClassesArray,
  type DbClassWithRelations,
} from '@/services/mappers/classMappers';
import { mapDatabaseToTrial, type DbTrialWithShow } from '@/services/mappers/trialMappers';
import type { SyncableClassData } from '@/store/classStore';
import type { Trial } from '@/store/trialStore';

/** One class with its trial and that trial's class list, as anon sees them. */
export interface PublicClassContext {
  currentClass: SyncableClassData;
  parentTrial: Trial;
  trialClasses: SyncableClassData[];
}

export const publicClassContextQueryKey = (showId: string, trialId: string, classId: string) =>
  ['classes', 'public-context', showId, trialId, classId] as const;

/**
 * anon's answer for one class on a show's public results page, or null when
 * anon may not see it there. Every read is online and RLS-filtered for anon
 * (no session): the class (getPublicClassById), the show's trials
 * (getPublicTrialsByShow) and the class's trial's classes (getClassesByTrialId,
 * PostgREST when there is no signed-in session). No filter is added on top of
 * RLS; the class only has to belong to the trial and show in the URL.
 */
export async function fetchPublicClassContext(
  showId: string,
  trialId: string,
  classId: string
): Promise<PublicClassContext | null> {
  const currentClass = await getPublicClassById(classId);
  if (!currentClass || currentClass.trialId !== trialId) return null;

  const [trials, classes] = await Promise.all([
    getPublicTrialsByShow(showId),
    getClassesByTrialId(trialId),
  ]);
  // getClassesByTrialId reports a failed read as { data: [], error }, which
  // would otherwise read as a trial with no classes.
  if (classes.error) throw classes.error;

  const trialRow = (trials.data as unknown as DbTrialWithShow[]).find(t => t.id === trialId);
  if (!trialRow) return null;

  return {
    currentClass,
    parentTrial: mapDatabaseToTrial(trialRow),
    trialClasses: mapDatabaseClassesArray(classes.data as unknown as DbClassWithRelations[]),
  };
}

/**
 * INTENT: MYK9-785, same owner decision as MYK9-747/768/779/780/783. A guest's
 * class, trial and class list are never the device replica (the class and
 * trial stores hold whatever an earlier signed-in session could see: drafts,
 * rows deleted on the server since). They are read online every mount, and
 * only THIS mount's completed fetch is ever shown (resolveGuestRead): nothing
 * cached while it runs, nothing offline.
 */
export function usePublicClassContextQuery(
  ids: { showId: string | undefined; trialId: string | undefined; classId: string | undefined },
  enabled: boolean
): { read: GuestReadState<PublicClassContext | null>; refetch: () => void } {
  const { showId = '', trialId = '', classId = '' } = ids;
  const hasIds = Boolean(showId && trialId && classId);
  const query = useQuery({
    queryKey: publicClassContextQueryKey(showId, trialId, classId),
    queryFn: () => fetchPublicClassContext(showId, trialId, classId),
    enabled: enabled && hasIds,
    ...GUEST_READ_QUERY_OPTIONS,
  });
  const isOnline = useQueryOnlineStatus();
  // A guest URL missing an id names no class anon can see.
  const read: GuestReadState<PublicClassContext | null> = hasIds
    ? resolveGuestRead(query, isOnline)
    : { kind: 'ready', data: null };
  return { read, refetch: () => void query.refetch() };
}
