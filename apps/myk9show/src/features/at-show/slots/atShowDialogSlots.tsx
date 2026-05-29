/**
 * atShowDialogSlots — myK9Show host shims satisfying ringside's
 * `EntryListDialogSlots` contract (Phase 1a spike).
 *
 * These are intentionally THIN: each shim wraps myK9Show's shadcn Dialog
 * and wires the contract callbacks so ringside's EntryList page can mount
 * and exercise its dialog flows on the `/at-show` route. The only shim
 * with real interactive behavior is `CheckinStatusDialog` (the spike's
 * "change an entry status" smoke test). The rest render a title + close +
 * the primary action; the underlying data handlers are spike stubs owned
 * by the host hooks and get polished in a later /at-show UI sprint.
 *
 * Ownership note: ringside owns the prop shapes (imported from
 * `@myk9/ringside`); the host components (split into sibling modules by
 * concern) conform to them. This file only assembles the slot bag.
 */
import type { EntryListDialogSlots } from '@myk9/ringside';
import { CheckinStatusDialog } from './CheckinStatusDialog';
import {
  AreaCountSelectionDialog,
  ClassOptionsDialog,
  ClassRequirementsDialog,
  ClassSettingsDialog,
  ClassStatusDialog,
  MaxTimeDialog,
} from './classDialogs';
import {
  NoStatsDialog,
  RunOrderDialog,
  ScoresheetPrintDialog,
} from './actionDialogs';

export const atShowDialogSlots: EntryListDialogSlots = {
  CheckinStatusDialog,
  ClassOptionsDialog,
  ClassStatusDialog,
  ClassRequirementsDialog,
  ClassSettingsDialog,
  MaxTimeDialog,
  RunOrderDialog,
  ScoresheetPrintDialog,
  NoStatsDialog,
  AreaCountSelectionDialog,
};
