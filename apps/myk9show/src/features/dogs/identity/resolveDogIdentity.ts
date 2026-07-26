/**
 * Dog identity resolution — MYK9-90 / dog-identity-normalization section 2.
 *
 * Identity attributes that belong to a REGISTRATION, not to the dog:
 * registered name, breed, variety, registration number. A dog has one call
 * name; everything else is a claim made to a specific sanctioning organization.
 *
 * Two resolvers, deliberately different:
 *
 *  - `resolveDogIdentityForOrganization` — for organization-scoped surfaces
 *    (entry blanks, AKC submissions, registry-specific views). It returns the
 *    values from THAT organization's registration and **never falls back** to
 *    another organization. Paperwork goes to a sanctioning body; putting a
 *    UKC breed on an AKC form is worse than leaving the field blank.
 *
 *  - `resolveDogIdentity` — for generic surfaces with no organization in
 *    context (My Dogs, search results, entry summaries). It returns the
 *    primary registration, defaulting to the earliest-created one so the
 *    answer is stable across page loads and unchanged by adding a second
 *    registration.
 *
 * A dog with no registration has no breed and no registered name. These
 * resolvers return nulls for that case. Callers render an empty state. They do
 * NOT substitute "Unknown", "Mixed Breed", or any other guess — a stored or
 * emitted guess is a claim about someone's dog and it travels into paperwork.
 *
 * Pure module: no I/O, no Supabase, no React. Safe to call from the offline
 * replication path and from PDF builders alike.
 */

/**
 * The subset of a `dog_registrations` row these resolvers read. Structural so
 * callers can pass rows from the replication cache, a PostgREST embed, or a
 * test fixture without converting them first.
 */
export interface DogRegistrationLike {
  organization?: string | null;
  registration_number?: string | null;
  registered_name?: string | null;
  breed?: string | null;
  variety?: string | null;
  is_primary?: boolean | null;
  created_at?: string | null;
  id?: string | null;
}

/** Resolved identity. Every field is nullable — absence is a legitimate answer. */
export interface DogIdentity {
  /** The organization whose registration supplied these values, if any. */
  organization: string | null;
  registrationNumber: string | null;
  registeredName: string | null;
  breed: string | null;
  variety: string | null;
}

/** The answer when a dog has no applicable registration. Frozen: never mutate a shared empty. */
export const EMPTY_DOG_IDENTITY: Readonly<DogIdentity> = Object.freeze({
  organization: null,
  registrationNumber: null,
  registeredName: null,
  breed: null,
  variety: null,
});

/**
 * `dog_registrations.organization` is free text and has drifted: the live
 * database holds both `AKC` and `AKC (American Kennel Club)`, plus
 * `UKC (United Kennel Club)`. An exact-string match therefore misses most
 * rows — which is why the AKC submission's registered-name lookup, which used
 * `.eq('organization', 'AKC')`, only ever matched a minority of registrations.
 *
 * Normalization: upper-case, drop any parenthetical, trim. Then map known
 * spelled-out names onto their abbreviation. Returns null for blank input.
 */
export function normalizeOrganization(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const withoutParenthetical = raw.replace(/\(.*$/, '');
  const upper = withoutParenthetical.trim().toUpperCase();
  if (upper === '') return null;
  return SPELLED_OUT_ORGANIZATIONS[upper] ?? upper;
}

const SPELLED_OUT_ORGANIZATIONS: Readonly<Record<string, string>> = Object.freeze({
  'AMERICAN KENNEL CLUB': 'AKC',
  'UNITED KENNEL CLUB': 'UKC',
  'AUSTRALIAN SHEPHERD CLUB OF AMERICA': 'ASCA',
  'CANADIAN KENNEL CLUB': 'CKC',
  // Carried over from the former `lib/dogRegistrationBreed.ts`, which this
  // module replaced (MYK9-90 task 2.3). That helper matched organizations
  // without stripping the parenthetical, so it missed the live
  // `AKC (American Kennel Club)` rows entirely.
  'FEDERATION CYNOLOGIQUE INTERNATIONALE': 'FCI',
});

/** True when a registration row belongs to `organization`, tolerating naming drift. */
export function registrationMatchesOrganization(
  registration: DogRegistrationLike,
  organization: string | null | undefined
): boolean {
  const target = normalizeOrganization(organization);
  if (target == null) return false;
  return normalizeOrganization(registration.organization) === target;
}

function toIdentity(registration: DogRegistrationLike): DogIdentity {
  return {
    organization: registration.organization ?? null,
    registrationNumber: blankToNull(registration.registration_number),
    registeredName: blankToNull(registration.registered_name),
    breed: blankToNull(registration.breed),
    variety: blankToNull(registration.variety),
  };
}

/** Treat whitespace-only stored values as absent — a blank string is not a registered name. */
function blankToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Deterministic ordering: primary first, then earliest created, then id. Rows
 * with no `created_at` sort last so an undated row never displaces a dated one.
 */
function compareRegistrations(a: DogRegistrationLike, b: DogRegistrationLike): number {
  const aPrimary = a.is_primary === true;
  const bPrimary = b.is_primary === true;
  if (aPrimary !== bPrimary) return aPrimary ? -1 : 1;

  const aCreated = a.created_at ?? null;
  const bCreated = b.created_at ?? null;
  if (aCreated !== bCreated) {
    if (aCreated == null) return 1;
    if (bCreated == null) return -1;
    return aCreated < bCreated ? -1 : 1;
  }

  return (a.id ?? '').localeCompare(b.id ?? '');
}

/**
 * Organization-scoped resolution. Returns the values recorded with
 * `organization`, or the empty identity when the dog holds no registration
 * with it. **No cross-organization fallback, by design.**
 *
 * When more than one registration exists with the same organization (possible
 * — nothing in the schema forbids it), the primary/earliest one wins, using the
 * same ordering as the generic resolver so the two never disagree.
 */
export function resolveDogIdentityForOrganization(
  registrations: readonly DogRegistrationLike[] | null | undefined,
  organization: string | null | undefined
): DogIdentity {
  if (!registrations || registrations.length === 0) return { ...EMPTY_DOG_IDENTITY };
  const matching = registrations.filter(r => registrationMatchesOrganization(r, organization));
  if (matching.length === 0) return { ...EMPTY_DOG_IDENTITY };
  const [chosen] = [...matching].sort(compareRegistrations);
  return toIdentity(chosen);
}

/**
 * Generic resolution for surfaces with no organization in context. Returns the
 * primary registration, falling back to the earliest-created when none is
 * marked (which is what the `is_primary` backfill produces anyway), and the
 * empty identity when the dog has no registration at all.
 */
export function resolveDogIdentity(
  registrations: readonly DogRegistrationLike[] | null | undefined
): DogIdentity {
  if (!registrations || registrations.length === 0) return { ...EMPTY_DOG_IDENTITY };
  const [chosen] = [...registrations].sort(compareRegistrations);
  return toIdentity(chosen);
}
