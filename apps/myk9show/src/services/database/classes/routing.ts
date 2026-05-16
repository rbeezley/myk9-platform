import { supabase, createDatabaseError, type DatabaseError } from '../supabaseClient';
import { withReplicationFallback } from '../_shared/replication-fallback';
import { replicatedClassesTable } from '@/services/replication/ReplicatedClassesTable';
import { replicatedTrialsTable } from '@/services/replication/ReplicatedTrialsTable';

export interface ClassRouteContext {
  showId: string;
  trialId: string;
}

type ClassRouteContextResult = {
  data: ClassRouteContext | null;
  error: DatabaseError | null;
};

async function postgrestGetClassRouteContext(id: string): Promise<ClassRouteContextResult> {
  const { data, error } = await supabase
    .from('classes')
    .select('trial_id, trials!inner(show_id)')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw createDatabaseError(error, 'class', 'select_route_context');

  const showId = (data?.trials as { show_id?: string } | null)?.show_id;
  const trialId = data?.trial_id;
  return {
    data: trialId && showId ? { trialId, showId } : null,
    error: null,
  };
}

export const getClassRouteContext = async (id: string): Promise<ClassRouteContextResult> => {
  try {
    return await withReplicationFallback(
      async () => {
        const cls = await replicatedClassesTable.getClassById(id);
        if (!cls?.trialId || cls.deletedAt) {
          throw new Error('Class route context missing from replication cache');
        }

        const trial = await replicatedTrialsTable.getTrialById(cls.trialId);
        if (!trial?.showId) {
          throw new Error('Trial route context missing from replication cache');
        }

        return {
          data: { trialId: cls.trialId, showId: trial.showId },
          error: null,
        };
      },
      () => postgrestGetClassRouteContext(id),
      'class',
      'select_route_context'
    );
  } catch (error) {
    return { data: null, error: error as DatabaseError };
  }
};
