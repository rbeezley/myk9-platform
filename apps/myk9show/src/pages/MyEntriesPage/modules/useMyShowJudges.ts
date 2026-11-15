/**
 * Judge name per class for the shows on My Shows.
 *
 * Entry rows carry no judge and an exhibitor cannot read `people`, so the
 * names come from the public `get_shows_judges` path. A show the call could
 * not answer for is unknown, never "no judge": for those classes the
 * replicated class row's resolved judge is read instead, and a class with
 * neither renders nothing.
 *
 * @module MyEntriesPage/modules/useMyShowJudges
 */

import { useQuery } from '@tanstack/react-query';
import {
  fetchShowsJudgeNameParts,
  type JudgeNameParts,
} from '@/services/database/_shared/judgeNamesByClass';
import { replicatedClassesTable } from '@/services/replication/ReplicatedClassesTable';

/** classId -> judge display name. Absent means unknown. */
export type JudgeByClassId = Readonly<Record<string, string>>;

const NO_JUDGES: JudgeByClassId = Object.freeze({});

export function judgeDisplayName(parts: Pick<JudgeNameParts, 'firstName' | 'lastName'>): string {
  return `${parts.firstName ?? ''} ${parts.lastName ?? ''}`.trim();
}

export interface MyShowJudgeTarget {
  showId: string;
  classIds: readonly string[];
}

async function readReplicatedJudge(classId: string): Promise<string | undefined> {
  try {
    const cls = await replicatedClassesTable.getClassById(classId);
    return cls?.judgeResolved && cls.judgeName ? cls.judgeName : undefined;
  } catch {
    return undefined;
  }
}

export async function loadMyShowJudges(
  targets: readonly MyShowJudgeTarget[]
): Promise<JudgeByClassId> {
  const showIds = targets.map(target => target.showId);
  const byShow = await fetchShowsJudgeNameParts(showIds);
  const result: Record<string, string> = {};
  for (const target of targets) {
    const answered = byShow.get(target.showId);
    if (answered) {
      for (const classId of target.classIds) {
        const parts = answered.get(classId);
        const name = parts ? judgeDisplayName(parts) : '';
        if (name) result[classId] = name;
      }
      continue;
    }
    const names = await Promise.all(target.classIds.map(readReplicatedJudge));
    target.classIds.forEach((classId, index) => {
      const name = names[index];
      if (name) result[classId] = name;
    });
  }
  return result;
}

/** One read for every show on the page, keyed by the sorted show ids. */
export function useMyShowJudges(targets: readonly MyShowJudgeTarget[]): JudgeByClassId {
  const usable = targets.filter(target => target.showId && target.classIds.length > 0);
  // The answer is filtered to these class ids, so they belong in the key: a class
  // added to a cached show must not wait out staleTime for its judge.
  const key = usable
    .map(target => `${target.showId}:${[...new Set(target.classIds)].sort().join('+')}`)
    .sort()
    .join(',');
  const { data } = useQuery({
    queryKey: ['my-show-judges', key],
    queryFn: () => loadMyShowJudges(usable),
    enabled: usable.length > 0,
    // Offline is normal here: the default 'online' mode would pause the query and
    // the replicated-class fallback inside it could never run.
    networkMode: 'always',
    staleTime: 5 * 60 * 1000,
  });
  return data ?? NO_JUDGES;
}
