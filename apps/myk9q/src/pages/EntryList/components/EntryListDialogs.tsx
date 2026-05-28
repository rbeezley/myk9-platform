/**
 * Host re-export shim for `EntryListDialogs`.
 *
 * The component moved into `@myk9/ringside` in PR E2d-2b. Nine dialog
 * components are now required slot props on the ringside component;
 * `useAuth`/`hasRole` plumbing is gone (replaced by precomputed
 * `hideMaxTimeOption` / `hideSettingsOption` booleans the shim
 * derives from organizationUtils).
 *
 * Once all callers import from `@myk9/ringside` directly, this shim
 * can be deleted.
 */
export { EntryListDialogs } from '@myk9/ringside';
export type { EntryListDialogsProps } from '@myk9/ringside';
