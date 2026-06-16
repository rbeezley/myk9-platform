import type { Trial } from '@/components/trials/types/trial.types';

// INTENT: a PUBLIC link to where a signed-out visitor can preview a show's classes.
// The registration wizard (/shows/:id/register) is auth-gated — a cold exhibitor would be
// bounced to /sign-in. The trial details page (/shows/:id/trials/:trialId) is public and lists
// the offered classes, so "See classes" points there instead (UX-P2-04-EXP).
// Returns null when there is no trial to link to (the caller then renders nothing).
export function publicClassesHref(
  showId: string | null | undefined,
  allTrials: Trial[] | null | undefined
): string | null {
  const firstTrialId = allTrials?.[0]?.id;
  if (!showId || !firstTrialId) return null;
  return `/shows/${showId}/trials/${firstTrialId}`;
}
