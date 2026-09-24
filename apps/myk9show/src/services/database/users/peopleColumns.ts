/**
 * The column lists every `public.people` read uses, and the reason there are two.
 *
 * SA-008 replaced `select('*')` on the people directory with an explicit
 * allowlist so an RLS regression could not turn it into a full-table PII dump.
 * MYK9-570 finished the job: `people` now carries a handler's date of birth and
 * their registry-issued junior handler numbers, and a star select ships both to
 * every caller — including admin searches and role pickers that display neither.
 *
 * A star is also INVISIBLE to `peopleJuniorHandlerPiiContract`, which asserts
 * that no public surface names those columns: `'*'` contains neither string, so
 * the scan passes while the data flows. That test now fails the build on any
 * star select in a `from('people')` chain, which is why these constants exist
 * rather than a convention.
 */

/**
 * Every column the two user mappers read (`mapDatabaseToUser` for the userStore,
 * `mapDbUserToUser` for React Query). Keep in sync with both mappers; the
 * column-shape test in `userQueries.test.ts` pins it.
 *
 * MYK9-664 moved the junior-handler PII off `people` entirely, into
 * `people_private` (see personPrivate.ts), so there is no longer a wider
 * "directory" list that carries it.
 *
 * ONE string literal, not a `+` concatenation: the typed PostgREST client parses
 * the select string at the type level, and a concatenation is plain `string` to
 * it — which collapses every row type to `GenericStringError`.
 */
export const PEOPLE_MAPPER_COLUMNS =
  'id, first_name, last_name, email, phone, street_address, city, state, zip_code, country, profile_image, auth_user_id, status, created_at, updated_at, deleted_at, deleted_by' as const;
