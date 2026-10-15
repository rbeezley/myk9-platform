/**
 * MYK9-1162: reports that list who runs leave out entries awaiting a
 * registration number. A report opts in with `excludesHeldEntries` on its
 * registry definition, so the rule is one flag per report rather than a filter
 * per builder. Count and money reports do not set it: a held entry still holds
 * its capacity place and its fee.
 */
export function omitHeldEntries<T extends { awaitingRegistrationNumber?: boolean | undefined }>(
  entries: T[],
  omit: boolean | undefined
): T[] {
  return omit ? entries.filter(entry => entry.awaitingRegistrationNumber !== true) : entries;
}
