/**
 * The one door into the one class-create flow: the show wizard's `add-classes` mode.
 *
 * Every "Add Classes" button and every legacy class-creation URL resolves through here.
 * `trialId` focuses the picker on that trial; omit it for the show-level door (Setup).
 */
export function getAddClassesHref(showId: string, trialId?: string | null): string {
  const params = new URLSearchParams({ showId, mode: 'add-classes' });
  if (trialId) params.set('trialId', trialId);
  return `/secretary/create-show/wizard?${params.toString()}`;
}
