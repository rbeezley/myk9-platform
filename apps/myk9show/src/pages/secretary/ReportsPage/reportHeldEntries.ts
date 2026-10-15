import { isAwaitingRegistrationNumber, type ServerHeldFlag } from '@/features/dogs/identity';
import type { ReportDbEntry } from '@/lib/reports/types';
import type { DbClass, DbTrial } from '@/types/database-mappings';

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

/**
 * MYK9-1162: a held entry is kept off the catalog. Registrations this device
 * could not read completely are unknown, and the shared predicate then answers
 * from the replicated row's own `awaiting_registration_number`.
 */
export function isReportEntryHeld(
  e: ReportDbEntry,
  registryId: string,
  trial: DbTrial,
  classData: DbClass | undefined
): boolean {
  const dog = e.dog;
  const registrationsKnown = dog?.registrationsReadComplete !== false;
  return isAwaitingRegistrationNumber(
    {
      entryStatus: e.entry_status ?? undefined,
      deletedAt: e.deleted_at,
      awaiting_registration_number: (e as ServerHeldFlag).awaiting_registration_number,
    },
    registryId,
    registrationsKnown ? dog?.registrations : undefined,
    {
      trialType: trial.trial_type,
      className: classData?.name,
      element: classData?.element,
      level: classData?.level,
    }
  );
}
