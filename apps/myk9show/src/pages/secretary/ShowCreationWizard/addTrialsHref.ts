/**
 * The one door into adding trials to an existing show: the show wizard's `add-trials` mode.
 * Sibling of `getAddClassesHref`. (The Setup Show Map still inlines it; MYK9-944 deletes that view.)
 */
export function getAddTrialsHref(showId: string): string {
  const params = new URLSearchParams({ showId, mode: 'add-trials' });
  return `/secretary/create-show/wizard?${params.toString()}`;
}
