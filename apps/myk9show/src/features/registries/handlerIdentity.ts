/**
 * MYK9-570: who is the handler whose name the paperwork prints?
 *
 * ONE rule, in ONE place, answering ONE question: **the person whose name is
 * printed, or nobody.** Both print paths call it — the catalog mapper
 * (`resolveHandlerJunior`) and the entry-form fetch (`useEntryFormData`).
 *
 * It exists because two rounds of review found the same six lines wrong in two
 * different ways, the second caused by the fix for the first:
 *
 *  - Round 1: the entry-form fetch borrowed a handler person from a DIFFERENT
 *    entry on the same dog, printing one person's registry-issued AKC junior
 *    number under another person's name.
 *  - Round 2: deleting that fallback took the legitimate case with it. The
 *    entry-form fetch finds the handler via `handler !== ownerFullName`, so
 *    `handlerEntry` is deliberately UNDEFINED when the handler IS the owner —
 *    which is 1276 of 1281 live entries. The number stopped filling for 99.6%
 *    of them, and no test noticed because every fixture used a handler who was
 *    not the owner.
 *
 * The lesson both findings share is that "which person" was being decided
 * ad hoc at each call site out of whatever happened to be in scope. So it is
 * decided here instead, from three explicit inputs, and the call sites do not
 * get to improvise.
 *
 * ## The rule
 *
 * Candidates, in order, each admitted only if its name matches the printed text:
 *   1. the person `entries.handler_id` names;
 *   2. the dog's OWNER;
 *   3. nobody.
 *
 * There is deliberately no cross-entry lookup and no "nearest plausible person".
 * `entries.handler` is free text and `entries.handler_id` is a FK that a rename
 * leaves behind (the RPC's exhibitor branch discards the clear flag — MYK9-665),
 * so the FK alone is not identity. Matching on the printed name is what makes a
 * stale id harmless.
 *
 * ## What it deliberately gets wrong
 *
 * Asymmetric on purpose. A false negative prints a plain, correct name and loses
 * a "Jr."; a false positive makes a junior-eligibility claim about the wrong
 * person on official AKC paperwork and discloses a minor's registry number. So
 * every ambiguity resolves to `null`:
 *
 *  - a middle initial, a nickname, an unfolded accent or a generational suffix
 *    in the free text all fail to match, and lose the mark;
 *  - **two different people with the same name still match.** A name is the only
 *    evidence there is that the FK and the printed text mean the same person, so
 *    this is the accepted residual limit of the whole approach, not an oversight.
 *    Closing it needs the handler to be chosen from a person picker rather than
 *    typed, which is a product change.
 */

export interface HandlerPersonLike {
  first_name?: string | null | undefined;
  last_name?: string | null | undefined;
}

/**
 * Case, punctuation and whitespace folded away. Hyphens and apostrophes become
 * spaces so `Owner-Smith` and `O'Brien` survive a secretary typing them either
 * way; accents are NOT folded, so `José` typed as `Jose` loses the mark.
 */
export function normalizeHandlerName(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/[.,'`’-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Does the printed handler text name this person?
 *
 * Two readings, and exactly one applies to any given string:
 *
 *  - `Surname, Forename` — used when the text has a comma with something on
 *    both sides of it. The comma is the secretary's own statement of which half
 *    is which, so it is read POSITIONALLY: the part before it is the surname.
 *  - `Forename Surname` — everything else, including a stray trailing comma,
 *    which says nothing about order.
 *
 * A bare `Surname Forename` is never accepted, and the comma form never falls
 * back to the forward reading. Round 2 showed that accepting a bare reversal
 * makes a printed "Riley Morgan" match a person named Morgan Riley; round 3
 * showed that testing BOTH readings whenever a comma appears re-opened exactly
 * the same hole, because normalisation had already flattened the comma to a
 * space. One string, one reading.
 */
export function handlerNameMatchesPerson(
  printedHandlerName: string | null | undefined,
  person: HandlerPersonLike | null | undefined
): boolean {
  const raw = printedHandlerName ?? '';
  if (!person) return false;

  const first = normalizeHandlerName(person.first_name);
  const last = normalizeHandlerName(person.last_name);
  if (!first || !last) return false;

  // `Surname, Forename` — only when both sides of the comma carry a name.
  const comma = raw.indexOf(',');
  if (comma !== -1) {
    const beforeComma = normalizeHandlerName(raw.slice(0, comma));
    const afterComma = normalizeHandlerName(raw.slice(comma + 1));
    if (beforeComma && afterComma) {
      return beforeComma === last && afterComma === first;
    }
  }

  const printed = normalizeHandlerName(raw);
  return printed !== '' && printed === normalizeHandlerName(`${first} ${last}`);
}

export interface ResolveHandlerPersonInput<TPerson extends HandlerPersonLike> {
  /** `entries.handler` — the free text the paperwork prints. */
  printedHandlerName: string | null | undefined;
  /** The person `entries.handler_id` names, if the caller resolved one. */
  handlerIdPerson: TPerson | null | undefined;
  /** The dog's owner. The common case: the owner handles their own dog. */
  ownerPerson: TPerson | null | undefined;
}

/**
 * The person whose name the paperwork prints, or null.
 *
 * Pure. Generic over the person shape so the catalog (a hydrated
 * `handler_person`) and the entry form (a raw `people` row) share one rule
 * without sharing a type.
 */
export function resolveHandlerPerson<TPerson extends HandlerPersonLike>({
  printedHandlerName,
  handlerIdPerson,
  ownerPerson,
}: ResolveHandlerPersonInput<TPerson>): TPerson | null {
  if (handlerIdPerson && handlerNameMatchesPerson(printedHandlerName, handlerIdPerson)) {
    return handlerIdPerson;
  }
  if (ownerPerson && handlerNameMatchesPerson(printedHandlerName, ownerPerson)) {
    return ownerPerson;
  }
  return null;
}
