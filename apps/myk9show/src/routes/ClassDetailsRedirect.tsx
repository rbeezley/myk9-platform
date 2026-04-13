/**
 * ClassDetailsRedirect
 *
 * Handles bare /classes/:classId URLs (e.g. links from emails or old bookmarks)
 * by resolving the class's show and trial context, then redirecting to the full
 * contextual route: /shows/:showId/trials/:trialId/classes/:classId
 *
 * Resolution order:
 *   1. Replication store (no network round-trip if app data is already loaded)
 *   2. Supabase query fallback (for direct navigation before stores hydrate)
 */

import { useEffect, useState } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { useTrialStore } from '@/store/trialStore';
import { supabase } from '@/services/database/supabaseClient';
import { LoadingSkeleton } from '@/components/common/LoadingSkeleton';
import { PageShell } from '@/components/common/PageShell';
import { NotFoundState } from '@/components/common/NotFoundState';

type Resolved = { showId: string; trialId: string };

function resolveFromStore(
  classId: string,
  trialClasses: Record<string, { id: string }[]>,
  trials: { id: string; showId?: string }[]
): Resolved | null {
  for (const [trialId, classes] of Object.entries(trialClasses)) {
    if (classes.some(c => c.id === classId)) {
      const trial = trials.find(t => t.id === trialId);
      if (trial?.showId) return { trialId, showId: trial.showId };
    }
  }
  return null;
}

export function ClassDetailsRedirect() {
  const { classId } = useParams<{ classId: string }>();
  const { trials, trialClasses } = useTrialStore();
  const [dbResult, setDbResult] = useState<Resolved | false | null>(null);
  // null = still loading, false = not found, Resolved = ready to redirect

  // Check replication store first — no network call needed if data is loaded
  const storeResolved = classId ? resolveFromStore(classId, trialClasses, trials) : null;

  useEffect(() => {
    if (!classId || storeResolved) return;

    let cancelled = false;
    supabase
      .from('classes')
      .select('trial_id, trials!inner(show_id)')
      .eq('id', classId)
      .is('deleted_at', null)
      .single()
      .then(({ data }) => {
        if (cancelled) return;
        const showId = (data?.trials as { show_id: string } | null)?.show_id;
        const trialId = data?.trial_id;
        if (trialId && showId) {
          setDbResult({ trialId, showId });
        } else {
          setDbResult(false);
        }
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  if (!classId) {
    return <Navigate to="/shows" replace />;
  }

  if (storeResolved) {
    return (
      <Navigate
        to={`/shows/${storeResolved.showId}/trials/${storeResolved.trialId}/classes/${classId}`}
        replace
      />
    );
  }

  if (dbResult === false) {
    return (
      <PageShell>
        <NotFoundState entityName="Class" backTo="/shows" backLabel="Back to Shows" />
      </PageShell>
    );
  }

  if (dbResult) {
    return (
      <Navigate
        to={`/shows/${dbResult.showId}/trials/${dbResult.trialId}/classes/${classId}`}
        replace
      />
    );
  }

  return (
    <PageShell>
      <LoadingSkeleton variant="cards" count={2} />
    </PageShell>
  );
}
