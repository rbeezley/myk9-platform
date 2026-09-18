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
 * Accepts `First Last`, and `Last, First` **only when the printed text actually
 * carried a comma**. A bare `Last First` is rejected: round 2 showed that
 * accepting it makes a printed "Riley Morgan" match a stale person whose first
 * name is Morgan and last name is Riley — a false positive, which is the
 * direction that costs. The comma is the secretary's own signal that they typed
 * it backwards, so it is the only evidence used for that reading.
 */
export function handlerNameMatchesPerson(
  printedHandlerName: string | null | undefined,
  person: HandlerPersonLike | null | undefined
): boolean {
  const raw = printedHandlerName ?? '';
  const printed = normalizeHandlerName(raw);
  if (!printed || !person) return false;

  const first = normalizeHandlerName(person.first_name);
  const last = normalizeHandlerName(person.last_name);
  if (!first || !last) return false;

  if (printed === normalizeHandlerName(`${first} ${last}`)) return true;
  // `Last, First` — comma required.
  return raw.includes(',') && printed === normalizeHandlerName(`${last} ${first}`);
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
