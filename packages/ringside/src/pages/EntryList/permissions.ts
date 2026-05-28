/**
 * Narrow permission union the EntryList page tree consumes.
 *
 * Why this exists (PR E2d-2b)
 * ---------------------------
 * The host's `usePermission()` returns a function over
 * `keyof UserPermissions` — a union of ~30+ permission keys spanning
 * every page in apps/myk9q. Importing that union into ringside would
 * drag the entire host permission surface into the package as a
 * type-only coupling.
 *
 * The EntryList page only ever asks about 4 permissions. Defining the
 * union locally lets ringside narrow the contract to exactly what it
 * uses, and lets the page contract's `context.hasPermission` field
 * (in `pageProps.ts`) share the same type without duplication.
 *
 * Host compatibility
 * ------------------
 * `(p: EntryListPermission) => boolean` is assignable from
 * `(p: keyof UserPermissions) => boolean` whenever
 * `EntryListPermission extends keyof UserPermissions` — which it does.
 * The host's `usePermission()` return value satisfies ringside's
 * contract without any wrapper.
 */
export type EntryListPermission =
  | 'canScore'
  | 'canCheckInDogs'
  | 'canChangeRunOrder'
  | 'canManageClasses';
