// The wizard offers only sanctioning bodies with a real rulebook config —
// picking a body the app can't run dead-ends at an empty class step
// (docs/audits/2026-07-01-show-creation-wizard-ux.md §4). The list is owned by
// the shared domain module `@/data/organizations` (the club onboarding lead
// form needs a *broader* list, so the two must not share one constant).
export { SHOW_ORGANIZATIONS as ORGANIZATIONS } from '@/data/organizations';
export type { OrganizationOption } from '@/data/organizations';

export interface ShowDetailsStepProps {
  className?: string;
  /** Existing persisted children make the show's registry identity immutable. */
  persistedTrialCount?: number;
  persistedClassCount?: number;
}

export interface ResolvedJudge {
  id: string;
  name: string;
  judgeNumber: string;
}
