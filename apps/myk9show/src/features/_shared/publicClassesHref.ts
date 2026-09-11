import type { Show } from '@/types/show-types';
import { buildOfferedClasses, OFFERED_CLASSES_ANCHOR } from './landing/offeredClasses';

// INTENT: a PUBLIC destination where a signed-out visitor can preview a show's classes.
// The registration wizard (/shows/:id/register) is auth-gated — a cold exhibitor would be
// bounced to /sign-in (UX-P2-04-EXP).
//
// This used to point OUT of the premium, at /shows/:id/trials/:trialId. Two reasons it
// now points at a section within the premium instead:
//   1. It only ever linked the FIRST trial, so on a multi-registry show the visitor saw
//      one day's elements and no hint the others differed.
//   2. That trial page also publishes the entry list — handler and dog names — to anyone,
//      and MYK9-466 is the decision to stop that. Keeping this link pointed there would
//      make gating the trial page delete the exhibitor's only way to preview classes.
//
// Returns null when the show has no classes to preview; SeeClassesLink then renders
// nothing, which is right because OfferedClassesSection renders nothing either.
export function publicClassesHref(show: Show | null | undefined): string | null {
  return buildOfferedClasses(show).length > 0 ? `#${OFFERED_CLASSES_ANCHOR}` : null;
}
