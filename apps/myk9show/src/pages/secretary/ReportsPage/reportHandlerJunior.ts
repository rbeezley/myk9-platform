import { resolveHandlerPerson } from '@/features/registries/handlerIdentity';
import type { ReportDbEntry, ReportEntry } from '@/lib/reports/types';
import type { DbTrial } from '@/types/database-mappings';

/**
 * MYK9-570: is this entry's handler a junior at THIS trial?
 *
 * Per entry, not per person: the same person is a junior at a March trial and
 * an adult at a November one, and the three registries do not even measure on
 * the same day. Since MYK9-664 each entry RECORDS the answer when it is created
 * (`entries.handler_is_junior`, computed by the database from the SQL twin of
 * `deriveJuniorStatus`), because the secretary printing this may not read the
 * date of birth, and must not be able to re-derive it by moving the trial date.
 * Returns an empty
 * object — not `handlerIsJunior: false` — whenever the answer is unknown, so a
 * missing hydration read cannot print as "definitely an adult".
 */
export function resolveHandlerJunior(
  e: ReportDbEntry,
  identity: { name: string | null },
  trial?: DbTrial
): Pick<ReportEntry, 'handlerIsJunior'> {
  if (!trial) return {};
  const person = e.handler_person;
  if (!person) return {};

  // Who the paperwork is about is decided in ONE place for every print path —
  // see handlerIdentity.ts. The catalog has no owner row in hand, so the
  // handler_id person is its only candidate; the rule still requires that
  // person to bear the printed name, because a rename leaves the id behind.
  const handlerPerson = resolveHandlerPerson({
    printedHandlerName: identity.name,
    handlerIdPerson: person,
    ownerPerson: null,
  });
  if (!handlerPerson) return {};

  // Only an affirmative true marks. false (adult) and null (no date of birth,
  // an ASCA trial, a date after the trial) print the plain name.
  return handlerPerson.is_junior === true ? { handlerIsJunior: true } : {};
}
