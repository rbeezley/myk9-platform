import type { ReportDbEntry } from '@/lib/reports/types';
import { loadEntryHandlerJuniorFlags } from '@/services/database/users/juniorHandlerProfiles';
import { attachDogRegistrations } from './attachDogRegistrations';
import { hydrateCatalogDogProfiles } from './reportCatalogHydration';

export interface HydratedReportEntries {
  entries: ReportDbEntry[];
  registrationsReadComplete: boolean;
  /** MYK9-1009: false when the owner address / date of birth read did not complete. */
  catalogProfilesReadComplete: boolean;
}

/**
 * MYK9-570 / MYK9-664: hydrate each entry with its handler's name and the
 * junior flag that entry recorded at creation for THAT entry's trial.
 *
 * The replica carries `entries.handler_id` but nothing from `people`, so the
 * catalog cannot know whether a handler is a junior without asking. The date of
 * birth itself never reaches this client (MYK9-664): the database returns the
 * stored per-entry flag, and only for shows the caller manages. The replica does
 * not carry `entries.handler_is_junior` on purpose: the column has no grant (the
 * entries views would show it to exhibitors too), and the name check below needs
 * an online `people` read anyway. Deliberately ANCILLARY — a
 * failed read leaves `handler_person` undefined, which the mapper reads as
 * "unknown", so the catalog prints without junior marks instead of refusing to
 * print.
 */
async function hydrateHandlerJuniorProfiles(entries: ReportDbEntry[]): Promise<ReportDbEntry[]> {
  const refs = entries.flatMap(entry => {
    const handlerId = (entry as { handler_id?: string | null }).handler_id;
    return handlerId && entry.id ? [{ entryId: entry.id, handlerId }] : [];
  });
  if (refs.length === 0) return entries;

  const { byEntryId, readComplete } = await loadEntryHandlerJuniorFlags(refs);
  // A partial read is NOT a partial answer here. An entry whose handler happened
  // to fall in a failed batch would come back with no `handler_person` and print
  // as an ordinary adult, so the catalog would mark some juniors and silently
  // miss others with nothing on the page to say so. Marking none of them is the
  // honest outcome, and it is what an offline secretary already gets.
  if (!readComplete || byEntryId.size === 0) return entries;

  return entries.map(entry => {
    const profile = entry.id ? byEntryId.get(entry.id) : undefined;
    if (!profile) return entry;
    return {
      ...entry,
      handler_person: {
        first_name: profile.firstName,
        last_name: profile.lastName,
        is_junior: profile.isJunior,
      },
    };
  });
}

/**
 * The hydration hop, exported for its own test. It is the step that turns
 * `entries.handler_id` into `handler_person`, and it is invisible to every
 * catalog test (they all inject `handler_person` directly), so without a handle
 * on it the feature could go inert with the suite still green.
 */
export const hydrateHandlerJuniorProfilesForTest = hydrateHandlerJuniorProfiles;

/**
 * THE hydration of report entries: handler junior profile, the AKC catalog's dog profile, then
 * the dog registrations. Reports (`useReportData`) and the class card's print fingerprint
 * (`usePrintedSheetEntries`) both call this one function, so their rows cannot diverge (MYK9-2103).
 */
export async function hydrateReportEntries(
  entries: ReportDbEntry[]
): Promise<HydratedReportEntries> {
  const withHandlerProfiles = await hydrateHandlerJuniorProfiles(entries);
  // MYK9-1009: the AKC marked catalog's dog date of birth and owner address.
  const { entries: withHandlers, readComplete: catalogProfilesReadComplete } =
    await hydrateCatalogDogProfiles(withHandlerProfiles);
  const { entries: withRegistrations, registrationsReadComplete } =
    await attachDogRegistrations(withHandlers);

  return { entries: withRegistrations, registrationsReadComplete, catalogProfilesReadComplete };
}
