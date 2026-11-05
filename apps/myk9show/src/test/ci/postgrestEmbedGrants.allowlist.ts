export type Role = 'anon' | 'authenticated';

/**
 * Data tables for the embed-grants guard (MYK9-1711): FK hints, the site
 * allowlist and the unknown-name allowlists. The policy and tests live in
 * postgrestEmbedGrants.test.ts.
 */

export interface SiteAllow {
  file: string;
  base: string;
  embed: string;
  role: Role;
  /**
   * A substring (or RegExp, to anchor with `^`) of the site's select string (after constant resolution,
   * whitespace collapsed to single spaces). It must match exactly ONE query
   * site in `file` for this base/embed/role: zero is "stale", two is
   * "ambiguous", and either fails the scan. Survives line moves.
   */
  match: string | RegExp;
  /** The evidence the call never runs for this role. */
  reason: string;
}

/**
 * PostgREST FK-column hints used as embed names (`dog:dog_id(...)`), resolved to
 * the table their foreign key targets so the embed is checked, not skipped.
 * Read from pg_constraint on 2026-11-05 for the bases that use them (entries,
 * stripe_orders, entry_status_history, and dogs for owner_id). A new hint name
 * fails the scan as "not in contract" until it is mapped here.
 */
export const FK_HINT_TARGETS: Readonly<Record<string, string>> = {
  dog_id: 'dogs',
  class_id: 'classes',
  owner_id: 'people', // dogs.owner_id; other tables' owner_id point at auth.users
  show_id: 'shows',
  trial_id: 'trials',
  registration_id: 'enrollments',
  changed_by: 'people', // entry_status_history.changed_by
  handler_id: 'people', // entries.handler_id (migration 003)
};

/**
 * Base relations (`.from('<name>')`) that are real but outside the section A
 * contract, e.g. views, so there is no grant row to compare against. Empty:
 * add one only with a reason naming what the relation is.
 */
export const UNKNOWN_BASES: ReadonlyMap<string, string> = new Map<string, string>([]);

/** Embed names that cannot be checked at all. Empty: add one only with a reason. */
export const UNRESOLVABLE_EMBEDS: ReadonlySet<string> = new Set<string>();

/**
 * Site-level exceptions: a call that provably never runs for the role. File +
 * base + embed + role only, never a blanket table entry, so a new call on the
 * same tables is still checked.
 */
export const SITE_ALLOWLIST: readonly SiteAllow[] = [
  {
    file: 'apps/myk9show/src/hooks/useEntryEligibility.ts',
    base: 'dogs',
    embed: 'dog_registrations',
    role: 'anon',
    match: 'height, date_of_birth, registrations:dog_registrations',
    reason:
      'selects dogs.height and date_of_birth, outside the anon dogs columns; entry-form eligibility check',
  },
  {
    file: 'apps/myk9show/src/pages/onboarding/steps/StepDogs.tsx',
    base: 'dogs',
    embed: 'dog_registrations',
    role: 'anon',
    match: 'call_name, registrations:dog_registrations(id, created_at, organization',
    reason:
      'onboarding redirects to /sign-in without a user and the query is keyed on the people-row personId; anon has neither',
  },
  {
    file: 'apps/myk9show/src/services/database/classes/reads.ts',
    base: 'classes',
    embed: 'entries',
    role: 'anon',
    match: 'entries ( id, class_id )',
    reason:
      'runs only inside the `session?.user && !session.user.is_anonymous` branch of postgrestGetClassById; the anonymous branch must not gain this embed (a second match fails as ambiguous)',
  },
  {
    file: 'apps/myk9show/src/services/database/dogs/dogDetailRead.ts',
    base: 'dogs',
    embed: 'health_records',
    role: 'anon',
    match: /^\*, owner:people/,
    reason:
      'readServerDog: ' +
      'select star on dogs: anon holds only dogs(id, name, call_name, breed, image_url) column grants, so the base read is denied before the embed; the owner:people embed also names phone and address columns anon lacks',
  },
  {
    file: 'apps/myk9show/src/services/database/dogs/dogDetailRead.ts',
    base: 'dogs',
    embed: 'health_records',
    role: 'anon',
    match: /^owner:people/,
    reason:
      'readDeviceDog supplemental read: dogs rows come from the replica; the owner:people embed names phone and address columns anon lacks',
  },
  {
    file: 'apps/myk9show/src/services/database/dogs/reads.ts',
    base: 'dogs',
    embed: 'dog_registrations',
    role: 'anon',
    match: 'email ), registrations:dog_registrations(*)',
    reason:
      'updateDog: a write that needs auth; select star on dogs is outside the anon column grant',
  },
  {
    file: 'apps/myk9show/src/services/database/dogs/reads.ts',
    base: 'dogs',
    embed: 'dog_registrations',
    role: 'anon',
    match: 'email, phone ), registrations:dog_registrations(*)',
    reason:
      'searchAllDogs: secretary-only (see its comment) and selects dogs star, denied to anon on the base',
  },
  {
    file: 'apps/myk9show/src/services/database/judges/reads.ts',
    base: 'people',
    embed: 'judge_qualifications',
    role: 'anon',
    match: 'judge_qualifications!inner(',
    reason:
      'PEOPLE_MAPPER_COLUMNS includes phone, address and others beyond the anon people columns (id, first_name, last_name, email), so anon is denied on the base before the embed',
  },
  {
    file: 'apps/myk9show/src/services/database/users/reads.ts',
    base: 'people',
    embed: 'judge_qualifications',
    role: 'anon',
    match: /deleted_by, judge_qualifications\(/,
    reason:
      'getAllUsers: ' +
      'PEOPLE_MAPPER_COLUMNS includes phone, address and others beyond the anon people columns (id, first_name, last_name, email), so anon is denied on the base before the embed',
  },
  {
    file: 'apps/myk9show/src/services/database/users/reads.ts',
    base: 'people',
    embed: 'judge_qualifications',
    role: 'anon',
    match: 'active ), judge_qualifications(',
    reason:
      'getUserById: ' +
      'PEOPLE_MAPPER_COLUMNS includes phone, address and others beyond the anon people columns (id, first_name, last_name, email), so anon is denied on the base before the embed',
  },
];
