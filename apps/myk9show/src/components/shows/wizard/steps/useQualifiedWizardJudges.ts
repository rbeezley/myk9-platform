import { useEffect, useMemo } from 'react';
import { useUserStore } from '@/store/userStore';
import { judgeIdsQualifiedForShow } from './ClassSelectionStep.helpers';

/**
 * The wizard show's judge ids that hold an active qualification for its registry
 * (MYK9-1580). Loads people when the step is reached without them.
 */
export function useQualifiedWizardJudges(
  judgeIds: readonly string[],
  organization: string | null | undefined
): { qualifiedJudgeIds: string[]; peopleLoaded: boolean } {
  const people = useUserStore(state => state.people);
  const loadPeople = useUserStore(state => state.loadPeople);
  useEffect(() => {
    if (people.length === 0) loadPeople();
  }, [people.length, loadPeople]);
  const qualifiedJudgeIds = useMemo(
    () => judgeIdsQualifiedForShow(judgeIds, people, organization),
    [judgeIds, people, organization]
  );
  return { qualifiedJudgeIds, peopleLoaded: people.length > 0 };
}
