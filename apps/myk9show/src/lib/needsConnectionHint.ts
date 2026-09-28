/**
 * Shared copy for controls that write the online-only visibility/check-in
 * override tables (`show_visibility_settings`, `trial_visibility_overrides`,
 * `class_visibility_overrides` — via `useShowSettingsMutations`). Those writes
 * have no offline replication path (MYK9-849 option (b)), so the control
 * disables instead of failing silently or erroring after the fact.
 */
export const NEEDS_CONNECTION_HINT = 'Needs a connection';
