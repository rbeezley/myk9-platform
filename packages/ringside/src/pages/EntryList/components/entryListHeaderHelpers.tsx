/**
 * EntryListHeader Helper Components
 *
 * Extracted from EntryListHeader.tsx to reduce complexity.
 * Contains the class-action list, trial info, and status badge components.
 *
 * PR E2d-2a — moved from apps/myk9q to @myk9/ringside. The host's
 * dateUtils re-export was a pass-through to @myk9/core, so this file
 * imports `formatTrialDate` from `@myk9/core` directly. No host
 * coupling remains.
 *
 * `EntryListHeader.tsx` itself arrives in E2d-2b — it consumes these
 * helpers along with the layout slots defined in
 * `../pageProps.ts::EntryListLayoutSlots`.
 */

/* eslint-disable react-refresh/only-export-components */

import React from 'react';
import {
  Printer,
  ClipboardCheck,
  ClipboardList,
  ListOrdered,
  Trophy,
  Settings,
  Timer,
  type LucideIcon,
} from 'lucide-react';
import { formatTrialDate, formatTrialLabel } from '@myk9/core';
import { getStatusDescriptor } from '@myk9/ui';

// ============================================================================
// Types
// ============================================================================

export interface PrintOption {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  icon: 'checkin' | 'results' | 'scoresheet';
}

export interface ActionsMenuConfig {
  showRunOrder?: boolean;
  showRecalculatePlacements?: boolean;
  showClassSettings?: boolean;
  showPrintOptions?: boolean;
  isRecalculatingPlacements?: boolean;
  onRunOrderClick?: () => void;
  onRecalculatePlacements?: () => void;
  onClassSettingsClick?: () => void;
  /** Combined A/B only: set the shared max time for both sections (MYK9-1086). */
  onSetMaxTimeClick?: (() => void) | undefined;
  printOptions: PrintOption[];
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
  id: 'run-order' | 'max-time' | 'class-options' | 'recalculate' | `print-${PrintOption['icon']}`;
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  disabled?: boolean;
}

const PRINT_ICONS: Record<PrintOption['icon'], LucideIcon> = {
  checkin: Printer,
  scoresheet: ClipboardList,
  results: ClipboardCheck,
};

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
      disabled: Boolean(config.isRecalculatingPlacements),
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
  if (config.showPrintOptions !== false) {
    for (const option of config.printOptions) {
      actions.push({
        id: `print-${option.icon}`,
        label: option.label,
        icon: PRINT_ICONS[option.icon],
        onSelect: option.onClick,
        ...(option.disabled !== undefined && { disabled: option.disabled }),
      });
    }
  }
  return actions;
}

// ============================================================================
// Trial Info Display
// ============================================================================

interface TrialInfoProps {
  trialDate?: string | null;
  trialName?: string | null;
  trialNumber?: string | null;
  judgeName?: string | null;
}

export const TrialInfo: React.FC<TrialInfoProps> = ({
  trialDate,
  trialName,
  trialNumber,
  judgeName,
}) => {
  const showDate = trialDate && trialDate !== '';
  const labelNumber = trialNumber !== '0' ? trialNumber : undefined;
  const showNumber = Boolean(trialName || labelNumber);
  const showJudge = judgeName && judgeName !== '' && judgeName !== 'TBD';

  // Build items array for clean separator handling
  const items: React.ReactNode[] = [];

  if (showDate) {
    items.push(
      <span key="date" className="trial-date-text">
        {formatTrialDate(trialDate)}
      </span>
    );
  }
  if (showNumber) {
    items.push(
      <span key="number" className="trial-number-text">
        {formatTrialLabel({ name: trialName, trialNumber: labelNumber })}
      </span>
    );
  }
  if (showJudge) {
    items.push(
      <span key="judge" className="trial-judge-text">
        Judge: {judgeName}
      </span>
    );
  }

  return (
    <div className="trial-info-simple">
      {items.map((item, index) => (
        <React.Fragment key={index}>
          {index > 0 && <span className="trial-separator">•</span>}
          {item}
        </React.Fragment>
      ))}
    </div>
  );
};

// ============================================================================
// Status Badge
// ============================================================================

interface StatusBadgeInfo {
  text: string;
  className: string;
}

export function getStatusBadge(classStatus?: string): StatusBadgeInfo | null {
  if (!classStatus || !['in_progress', 'briefing', 'start_time', 'setup'].includes(classStatus)) {
    return null;
  }
  const descriptor = getStatusDescriptor('class', classStatus);
  return { text: descriptor.label.toUpperCase(), className: 'status-neutral' };
}

// ClassInfoPopup has been replaced by ClassDetailsPopover, slotted as
// `EntryListLayoutSlots.ClassDetailsPopover` in `../pageProps.ts`.
