/**
 * EntryListHeader — page header for the EntryList page.
 *
 * Moved into @myk9/ringside in PR E2d-2b. Host coupling reduced to:
 *  - 6 UI primitives are now required slot props (HamburgerMenu,
 *    CompactOfflineIndicator, SyncIndicator, RefreshIndicator,
 *    FilterTriggerButton, ClassDetailsPopover). Previously imported
 *    directly from apps/myk9q's components/ui + components/dialogs.
 *  - `useNavigate` is unchanged — `react-router-dom` is now a
 *    ringside peer dep.
 *  - `formatTrialDate` now comes from `@myk9/core` directly (was
 *    `apps/myk9q/src/utils/dateUtils`).
 *  - `ActionsDropdownMenu` / `getStatusBadge` / `ActionsMenuConfig`
 *    come from sibling `./entryListHeaderHelpers` (already in
 *    ringside from PR E2d-2a).
 */

import React, { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Info } from 'lucide-react';
import { formatTrialDate } from '@myk9/core';
import type { ComponentType } from 'react';
import type { ClassInfo } from '../hooks/useEntryListData';
import {
  ActionsDropdownMenu,
  getStatusBadge,
  type ActionsMenuConfig,
} from './entryListHeaderHelpers';
import type {
  HamburgerMenuProps,
  CompactOfflineIndicatorProps,
  SyncIndicatorProps,
  RefreshIndicatorProps,
  FilterTriggerButtonProps,
  ClassDetailsPopoverProps,
} from '../pageProps';

export interface EntryListHeaderProps {
  classInfo: ClassInfo | null;
  isRefreshing: boolean;
  isSyncing: boolean;
  hasError: boolean;
  hasActiveFilters: boolean;
  onFilterClick: () => void;
  onRefresh: () => void;
  /** Actions menu items configuration */
  actionsMenu: ActionsMenuConfig;
  /** For combined view - show section badge */
  showSectionsBadge?: boolean;
  /** Long press handlers for hard refresh */
  refreshLongPressHandlers?: {
    onMouseDown: (e: React.MouseEvent) => void;
    onMouseUp: (e: React.MouseEvent) => void;
    onMouseLeave: (e: React.MouseEvent) => void;
    onTouchStart: (e: React.TouchEvent) => void;
    onTouchEnd: (e: React.TouchEvent) => void;
  };

  // ── Host-injected primitives ──────────────────────────────────────
  HamburgerMenu: ComponentType<HamburgerMenuProps>;
  CompactOfflineIndicator: ComponentType<CompactOfflineIndicatorProps>;
  SyncIndicator: ComponentType<SyncIndicatorProps>;
  RefreshIndicator: ComponentType<RefreshIndicatorProps>;
  FilterTriggerButton: ComponentType<FilterTriggerButtonProps>;
  ClassDetailsPopover: ComponentType<ClassDetailsPopoverProps>;
}

/**
 * Shared header component for EntryListPage and CombinedEntryListPage.
 * Displays class information, status indicators, and action menus.
 */
export const EntryListHeader: React.FC<EntryListHeaderProps> = ({
  classInfo,
  isRefreshing,
  isSyncing,
  hasError,
  hasActiveFilters,
  onFilterClick,
  onRefresh,
  actionsMenu,
  showSectionsBadge = false,
  refreshLongPressHandlers,
  HamburgerMenu,
  CompactOfflineIndicator,
  SyncIndicator,
  RefreshIndicator,
  FilterTriggerButton,
  ClassDetailsPopover,
}) => {
  const navigate = useNavigate();
  const [showActionsMenu, setShowActionsMenu] = React.useState(false);
  const [showInfoPopup, setShowInfoPopup] = React.useState(false);
  const classInfoRef = useRef<HTMLDivElement>(null);

  // Close menus when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.actions-menu-container')) {
        setShowActionsMenu(false);
      }
      if (!target.closest('.class-info-clickable')) {
        setShowInfoPopup(false);
      }
    };

    if (showActionsMenu || showInfoPopup) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showActionsMenu, showInfoPopup]);

  // Build trial info string
  const trialInfoParts: string[] = [];
  if (classInfo?.trialDate) {
    trialInfoParts.push(formatTrialDate(classInfo.trialDate));
  }
  if (classInfo?.trialNumber && classInfo.trialNumber !== '0') {
    trialInfoParts.push(`Trial ${classInfo.trialNumber}`);
  }
  const trialInfoText = trialInfoParts.join(' • ');

  // Check if there's extra info to show in popup
  const statusBadge = getStatusBadge(classInfo?.classStatus);
  const hasExtraInfo = classInfo?.judgeName || statusBadge || (showSectionsBadge && classInfo?.judgeNameB);

  // Memoize popover data to reduce inline complexity
  const popoverData = React.useMemo(() => {
    if (!classInfo) return null;
    // For combined sections, show both class IDs (e.g., "44311 / 44292")
    const classIdDisplay = classInfo.actualClassId
      ? classInfo.actualClassId
      : classInfo.actualClassIdA && classInfo.actualClassIdB
        ? `${classInfo.actualClassIdA} / ${classInfo.actualClassIdB}`
        : classInfo.actualClassIdA || classInfo.actualClassIdB;
    return {
      classId: classIdDisplay,
      status: classInfo.classStatus,
      totalEntries: classInfo.totalEntries,
      completedEntries: classInfo.completedEntries,
      judgeName: classInfo.judgeName,
      judgeNameB: classInfo.judgeNameB,
      timeLimitSeconds: classInfo.timeLimit ? parseInt(classInfo.timeLimit) : undefined,
      timeLimitArea2Seconds: classInfo.timeLimit2 ? parseInt(classInfo.timeLimit2) : undefined,
      timeLimitArea3Seconds: classInfo.timeLimit3 ? parseInt(classInfo.timeLimit3) : undefined,
      areaCount: classInfo.areas,
      visibilityPreset: classInfo.visibilityPreset,
      selfCheckinEnabled: classInfo.selfCheckin
    };
  }, [classInfo]);

  return (
    <header className="page-header entry-list-header">
      <HamburgerMenu
        backNavigation={{
          label: "Back to Classes",
          action: () => navigate(-1)
        }}
        currentPage="entries"
      />
      <CompactOfflineIndicator />
      {/* Class info - hover/tap to show details popup */}
      <div
        ref={classInfoRef}
        className={`class-info ${hasExtraInfo ? 'class-info-clickable' : ''}`}
        onClick={hasExtraInfo ? () => setShowInfoPopup(!showInfoPopup) : undefined}
        onMouseEnter={hasExtraInfo ? () => setShowInfoPopup(true) : undefined}
        onMouseLeave={hasExtraInfo ? () => setShowInfoPopup(false) : undefined}
        role={hasExtraInfo ? 'button' : undefined}
        tabIndex={hasExtraInfo ? 0 : undefined}
        onKeyDown={hasExtraInfo ? (e) => e.key === 'Enter' && setShowInfoPopup(!showInfoPopup) : undefined}
      >
        {/* Class name with small info indicator */}
        <div className="class-name-wrapper">
          <h1 className="class-name">
            {classInfo?.className?.toLowerCase().replace(/\b\w/g, l => l.toUpperCase()) || 'Loading...'}
          </h1>
          {hasExtraInfo && (
            <span className="info-indicator" aria-hidden="true">
              <Info size={12} />
            </span>
          )}
        </div>
        {/* Trial date and number */}
        {trialInfoText && (
          <div className="class-meta-row">
            <span className="trial-meta-text">{trialInfoText}</span>
          </div>
        )}
      </div>
      {/* Class Details Popover - renders via portal */}
      {hasExtraInfo && popoverData && (
        <ClassDetailsPopover
          isOpen={showInfoPopup}
          onClose={() => setShowInfoPopup(false)}
          anchorRef={classInfoRef}
          position="bottom"
          showJudgeB={showSectionsBadge}
          data={popoverData}
        />
      )}

      <div className="header-buttons">
        {isRefreshing && <RefreshIndicator isRefreshing={isRefreshing} />}

        {isSyncing && (
          <SyncIndicator
            status="syncing"
            compact
          />
        )}
        {hasError && (
          <SyncIndicator
            status="error"
            compact
            errorMessage="Sync failed"
          />
        )}

        {/* Filter button */}
        <FilterTriggerButton
          onClick={onFilterClick}
          hasActiveFilters={hasActiveFilters}
        />

        {/* Actions Menu (3-dot menu) */}
        <ActionsDropdownMenu
          isOpen={showActionsMenu}
          onToggle={() => setShowActionsMenu(!showActionsMenu)}
          onClose={() => setShowActionsMenu(false)}
          isRefreshing={isRefreshing}
          onRefresh={onRefresh}
          actionsMenu={actionsMenu}
          refreshLongPressHandlers={refreshLongPressHandlers}
        />
      </div>
    </header>
  );
};

export default EntryListHeader;
