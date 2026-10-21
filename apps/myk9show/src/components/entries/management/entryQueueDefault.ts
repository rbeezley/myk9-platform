import {
  getShowRegistrationQueueCounts,
  scopeShowRegistrationGroups,
  searchShowRegistrationGroups,
  type ShowRegistrationGroup,
  type ShowRegistrationQueue,
} from './showRegistrationProjection';

/** How many forms the table would list in the current scope, and how many of them need review. */
export interface ListedFormCounts {
  needsReview: number;
  all: number;
}

/**
 * The queue Entry Forms opens on when the URL names none (MYK9-1276): Needs review, unless it
 * would list nothing while All would list forms, in which case an empty table would hide forms
 * that exist. `null` (the forms have not loaded) keeps Needs review. The cockpit hook decides it
 * once per scope and show from the first loaded forms and keeps it (arrivals and refreshes never
 * flip it); it is never written to the URL, and a queue the URL names always wins over it.
 */
export function deriveDefaultQueues(listed: ListedFormCounts | null): ShowRegistrationQueue[] {
  return listed !== null && listed.needsReview === 0 && listed.all > 0 ? ['all'] : ['needs-review'];
}

/**
 * The counts `deriveDefaultQueues` judges, on the SAME scope `buildShowRegistrationPage` applies
 * to the table: a search replaces the trial/class scope, otherwise the picked classes and the
 * selected trials' classes narrow it.
 */
export function countListedForms(
  groups: ShowRegistrationGroup[],
  scope: {
    search: string;
    classIds: readonly string[];
    trialClassIds: readonly string[] | undefined;
  }
): ListedFormCounts {
  const search = scope.search.trim();
  const listed = search
    ? searchShowRegistrationGroups(groups, search).map(result => result.group)
    : scopeShowRegistrationGroups(groups, scope.classIds, scope.trialClassIds);
  const counts = getShowRegistrationQueueCounts(listed);
  return { needsReview: counts['needs-review'], all: counts.all };
}
