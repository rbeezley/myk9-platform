/**
 * EntryListHeader Helper Components
 *
 * Extracted from EntryListHeader.tsx to reduce complexity.
 * Contains the class-action list and status badge helpers.
 *
 * PR E2d-2a — moved from apps/myk9q to @myk9/ringside. The host's
 * No host coupling remains.
 *
 * `EntryListHeader.tsx` itself arrives in E2d-2b — it consumes these
 * helpers along with the layout slots defined in
 * `../pageProps.ts::EntryListLayoutSlots`.
 */

/* eslint-disable react-refresh/only-export-components */

import { ListOrdered, Trophy, Settings, Timer, type LucideIcon } from 'lucide-react';
import { getStatusDescriptor } from '@myk9/ui';

// ============================================================================
// Types
// ============================================================================

export interface ActionsMenuConfig {
  showRunOrder?: boolean;
  showRecalculatePlacements?: boolean;
  showClassSettings?: boolean;
  onRunOrderClick?: () => void;
  onRecalculatePlacements?: () => void;
  onClassSettingsClick?: () => void;
  /** Combined A/B only: set the shared max time for both sections (MYK9-1086). */
  onSetMaxTimeClick?: (() => void) | undefined;
}

/**
 * A combined A/B list's "Set Max Time (A & B)" action, or nothing. Max time is
 * the one class setting shared by both sections (one search); the host folds
 * permission into `hideMaxTimeOption`.
 */
export function pairMaxTimeAction(
  isCombined: boolean,
  hideMaxTimeOption: boolean | undefined,
  openMaxTime: (open: boolean) => void
): Pick<ActionsMenuConfig, 'onSetMaxTimeClick'> {
  return isCombined && !hideMaxTimeOption ? { onSetMaxTimeClick: () => openMaxTime(true) } : {};
}

// ============================================================================
// Class actions (MYK9-1697)
// ============================================================================

/**
 * One action on the class the entry list is showing. The header no longer draws
 * its own ⋮ menu: the host's ringside menu lists these under "This class", so
 * the entry list has one menu, not two side by side (owner decision D6).
 */
export interface ClassMenuAction {
  id: 'run-order' | 'max-time' | 'class-options' | 'recalculate';
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  disabled?: boolean;
}

/** The class actions this viewer may take, in the order the old ⋮ menu listed them. */
export function buildClassMenuActions(config: ActionsMenuConfig): ClassMenuAction[] {
  const actions: ClassMenuAction[] = [];
  if (config.showRunOrder && config.onRunOrderClick) {
    actions.push({
      id: 'run-order',
      label: 'Set Run Order',
      icon: ListOrdered,
      onSelect: config.onRunOrderClick,
    });
  }
  if (config.showRecalculatePlacements && config.onRecalculatePlacements) {
    actions.push({
      id: 'recalculate',
      label: 'Recalculate Placements',
      icon: Trophy,
      onSelect: config.onRecalculatePlacements,
    });
  }
  if (config.showClassSettings && config.onClassSettingsClick) {
    actions.push({
      id: 'class-options',
      label: 'Class Options',
      icon: Settings,
      onSelect: config.onClassSettingsClick,
    });
  }
  if (config.onSetMaxTimeClick) {
    actions.push({
      id: 'max-time',
      label: 'Set Max Time (A & B)',
      icon: Timer,
      onSelect: config.onSetMaxTimeClick,
    });
  }
  return actions;
}

// ============================================================================
// Status Badge
// ============================================================================

interface StatusBadgeInfo {
  text: string;
  className: string;
}

export function getStatusBadge(classStatus?: string): StatusBadgeInfo | null {
  if (
    !classStatus ||
    !['in_progress', 'briefing', 'start_time', 'setup', 'cancelled'].includes(classStatus)
  ) {
    return null;
  }
  const descriptor = getStatusDescriptor('class', classStatus);
  return { text: descriptor.label.toUpperCase(), className: 'status-neutral' };
}

// ClassInfoPopup has been replaced by ClassDetailsPopover, slotted as
// `EntryListLayoutSlots.ClassDetailsPopover` in `../pageProps.ts`.
