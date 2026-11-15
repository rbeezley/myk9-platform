/**
 * One search rule for the club people pickers (Add Member, Assign Officer, Appoint
 * Secretary).
 *
 * The pickers search the platform-wide people directory. A club admin may already read
 * every name and email there (MYK9-664), so this changes nothing about who can read what;
 * it changes how the pickers present it. Opening a picker used to show the first 20 people
 * in the system, which invites browsing; now nobody is listed until the admin types at
 * least two characters (MYK9-1983).
 *
 * Once a search is entered the list is capped, and the cap is admitted out loud: on a
 * platform-wide directory, a silent cap made "not in the list" indistinguishable from
 * "does not exist" (#1708).
 */

export const PEOPLE_PICKER_MIN_SEARCH_LENGTH = 2;
export const PEOPLE_PICKER_RESULT_CAP = 20;
export const PEOPLE_PICKER_PROMPT = 'Type a name or email to find someone.';
export const PEOPLE_PICKER_NO_MATCHES = 'No people found';

export interface PeoplePickerCandidate {
  firstName: string;
  lastName: string;
  email?: string | undefined;
}

export interface PeoplePickerResult<T> {
  /** The people to list, already capped. Empty until a search is long enough. */
  people: T[];
  /**
   * What to tell the admin. With no people it is the whole message (type to search, or
   * no matches); with people it is the truncation line, or null when nothing is hidden.
   */
  hint: string | null;
}

export function filterPeoplePicker<T extends PeoplePickerCandidate>(
  search: string,
  candidates: readonly T[]
): PeoplePickerResult<T> {
  const query = search.trim().toLowerCase();
  if (query.length < PEOPLE_PICKER_MIN_SEARCH_LENGTH) {
    return { people: [], hint: PEOPLE_PICKER_PROMPT };
  }

  const matches = candidates.filter(
    p =>
      `${p.firstName} ${p.lastName}`.toLowerCase().includes(query) ||
      p.email?.toLowerCase().includes(query)
  );
  if (matches.length === 0) return { people: [], hint: PEOPLE_PICKER_NO_MATCHES };

  const hint =
    matches.length > PEOPLE_PICKER_RESULT_CAP
      ? `Showing the first ${PEOPLE_PICKER_RESULT_CAP} of ${matches.length}. Keep typing to narrow the list.`
      : null;
  return { people: matches.slice(0, PEOPLE_PICKER_RESULT_CAP), hint };
}
