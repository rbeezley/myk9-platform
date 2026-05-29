/**
 * EntryListHeader Helper Components
 *
 * Extracted from EntryListHeader.tsx to reduce complexity.
 * Contains actions menu, trial info, and status badge components.
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
  RefreshCw,
  MoreVertical,
  Printer,
  ClipboardCheck,
  ClipboardList,
  ListOrdered,
  Trophy,
  Settings,
} from 'lucide-react';
import { formatTrialDate } from '@myk9/core';

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
  isRecalculatingPlacements?: boolean;
  onRunOrderClick?: () => void;
  onRecalculatePlacements?: () => void;
  onClassSettingsClick?: () => void;
  printOptions: PrintOption[];
}

// ============================================================================
// Actions Dropdown Menu
// ============================================================================

/**
 * Shared classes for a row in the actions dropdown (was `.action-menu-item` in
 * ringside.css). One source of truth for all menu buttons.
 */
const ACTION_MENU_ITEM_CLASS =
  'flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left text-sm text-foreground transition-colors hover:bg-muted active:bg-input disabled:cursor-not-allowed disabled:opacity-50';

interface ActionsDropdownMenuProps {
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  isRefreshing: boolean;
  onRefresh: () => void;
  actionsMenu: ActionsMenuConfig;
  /** Long press handlers for hard refresh */
  refreshLongPressHandlers?: {
    onMouseDown: (e: React.MouseEvent) => void;
    onMouseUp: (e: React.MouseEvent) => void;
    onMouseLeave: (e: React.MouseEvent) => void;
    onTouchStart: (e: React.TouchEvent) => void;
    onTouchEnd: (e: React.TouchEvent) => void;
  };
}

export const ActionsDropdownMenu: React.FC<ActionsDropdownMenuProps> = ({
  isOpen,
  onToggle,
  onClose,
  isRefreshing,
  onRefresh,
  actionsMenu,
  refreshLongPressHandlers,
}) => {
  const handleRefresh = () => {
    onClose();
    onRefresh();
  };

  const handleRunOrder = () => {
    onClose();
    actionsMenu.onRunOrderClick?.();
  };

  const handleRecalculate = () => {
    onClose();
    actionsMenu.onRecalculatePlacements?.();
  };

  const handleClassSettings = () => {
    onClose();
    actionsMenu.onClassSettingsClick?.();
  };

  const handlePrintOption = (option: PrintOption) => {
    onClose();
    option.onClick();
  };

  return (
    <div className="relative" data-actions-menu>
      <button
        className="icon-button actions-button"
        onClick={onToggle}
        aria-label="Actions menu"
        title="More Actions"
      >
        <MoreVertical className="h-5 w-5" />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-[calc(100%+0.5rem)] z-[100] mr-1 min-w-[220px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-card shadow-lg">
          {/* Refresh - Primary action (long press for full page reload) */}
          <button
            onClick={handleRefresh}
            className={ACTION_MENU_ITEM_CLASS}
            disabled={isRefreshing}
            title="Refresh (long press for full reload)"
            {...refreshLongPressHandlers}
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'rotating' : ''}`} />
            Refresh
          </button>

          {/* Divider after primary action */}
          <div className="my-1 h-px bg-border" />

          {/* Secondary actions */}
          {actionsMenu.showRunOrder && actionsMenu.onRunOrderClick && (
            <button
              onClick={handleRunOrder}
              className={ACTION_MENU_ITEM_CLASS}
            >
              <ListOrdered className="h-4 w-4" />
              Set Run Order
            </button>
          )}
          {actionsMenu.showRecalculatePlacements && actionsMenu.onRecalculatePlacements && (
            <button
              onClick={handleRecalculate}
              className={ACTION_MENU_ITEM_CLASS}
              disabled={actionsMenu.isRecalculatingPlacements}
            >
              <Trophy className={`h-4 w-4 ${actionsMenu.isRecalculatingPlacements ? 'rotating' : ''}`} />
              Recalculate Placements
            </button>
          )}
          {actionsMenu.showClassSettings && actionsMenu.onClassSettingsClick && (
            <button
              onClick={handleClassSettings}
              className={ACTION_MENU_ITEM_CLASS}
            >
              <Settings className="h-4 w-4" />
              Class Options
            </button>
          )}

          {/* Divider before print options */}
          <div className="my-1 h-px bg-border" />

          {/* Print options */}
          {actionsMenu.printOptions.map((option, index) => (
            <button
              key={index}
              onClick={() => handlePrintOption(option)}
              className={ACTION_MENU_ITEM_CLASS}
              disabled={option.disabled}
            >
              {option.icon === 'checkin' ? (
                <Printer className="h-4 w-4" />
              ) : option.icon === 'scoresheet' ? (
                <ClipboardList className="h-4 w-4" />
              ) : (
                <ClipboardCheck className="h-4 w-4" />
              )}
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Trial Info Display
// ============================================================================

interface TrialInfoProps {
  trialDate?: string | null;
  trialNumber?: string | null;
  judgeName?: string | null;
}

export const TrialInfo: React.FC<TrialInfoProps> = ({ trialDate, trialNumber, judgeName }) => {
  const showDate = trialDate && trialDate !== '';
  const showNumber = trialNumber && trialNumber !== '' && trialNumber !== '0';
  const showJudge = judgeName && judgeName !== '' && judgeName !== 'TBD';

  // Build items array for clean separator handling
  const items: React.ReactNode[] = [];

  if (showDate) {
    items.push(
      <span key="date" className="trial-date-text">{formatTrialDate(trialDate)}</span>
    );
  }
  if (showNumber) {
    items.push(
      <span key="number" className="trial-number-text">Trial {trialNumber}</span>
    );
  }
  if (showJudge) {
    items.push(
      <span key="judge" className="trial-judge-text">Judge: {judgeName}</span>
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
  switch (classStatus) {
    case 'in_progress':
      return { text: 'IN PROGRESS', className: 'status-in-progress' };
    case 'briefing':
      return { text: 'BRIEFING NOW', className: 'status-briefing' };
    case 'start_time':
    case 'setup':
      return { text: 'UPCOMING', className: 'status-upcoming' };
    default:
      return null;
  }
}

interface ClassStatusBadgeProps {
  classStatus?: string;
}

export const ClassStatusBadge: React.FC<ClassStatusBadgeProps> = ({ classStatus }) => {
  const statusBadge = getStatusBadge(classStatus);

  if (!statusBadge) return null;

  return (
    <>
      <span className="trial-separator">•</span>
      <span className={`class-status-badge ${statusBadge.className}`}>
        {statusBadge.text}
      </span>
    </>
  );
};

// ============================================================================
// Sections Badge (for combined view)
// ============================================================================

interface SectionsBadgeProps {
  show: boolean;
  judgeName?: string | null;
  judgeNameB?: string | null;
}

export const SectionsBadge: React.FC<SectionsBadgeProps> = ({ show, judgeName, judgeNameB }) => {
  if (!show || !judgeNameB || judgeNameB === judgeName) {
    return null;
  }

  return (
    <>
      <span className="trial-separator">•</span>
      <span className="class-status-badge sections-badge">Section A & B</span>
    </>
  );
};

// ClassInfoPopup has been replaced by ClassDetailsPopover, slotted as
// `EntryListLayoutSlots.ClassDetailsPopover` in `../pageProps.ts`.
