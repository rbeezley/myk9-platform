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
import { cn } from '@myk9/ui';
import { formatTrialDate, formatTrialLabel } from '@myk9/core';
import type { ComponentType } from 'react';
import type { ClassInfo } from '../hooks/useEntryListData';
import {
  ActionsDropdownMenu,
  getStatusBadge,
  type ActionsMenuConfig,
} from './entryListHeaderHelpers';
import { parseTimeLimit } from '../entryListHelpers';
import type {
  HamburgerMenuProps,
  CompactOfflineIndicatorProps,
  SyncIndicatorProps,
  RefreshIndicatorProps,
  FilterTriggerButtonProps,
  ClassDetailsPopoverProps,
} from '../pageProps';

function handleClassInfoKeyDown(event: React.KeyboardEvent, onToggle: () => void): void {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  onToggle();
}

/** "<trial date> • <trial label>" (MYK9-704): the label is the trial's name, never "Trial <n>". */
function buildTrialInfoText(classInfo: ClassInfo | null): string {
  const parts: string[] = [];
  if (classInfo?.trialDate) parts.push(formatTrialDate(classInfo.trialDate));
  const trialNumber = classInfo?.trialNumber !== '0' ? classInfo?.trialNumber : undefined;
  if (classInfo?.trialName || trialNumber) {
    parts.push(formatTrialLabel({ name: classInfo?.trialName, trialNumber }));
  }
  return parts.join(' • ');
}

function getClassInfoA11yProps(
  hasExtraInfo: boolean,
  isOpen: boolean
): { 'aria-expanded'?: boolean; 'aria-controls'?: string } {
  if (!hasExtraInfo) return {};
  return { 'aria-expanded': isOpen, 'aria-controls': 'class-details-popover' };
}

export interface EntryListHeaderProps {
  classInfo: ClassInfo | null;
  isRefreshing: boolean;
  isSyncing: boolean;
  hasError: boolean;
  /** Count of writes queued locally but not yet synced (see EntryListActions). */
  pendingCount?: number;
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
 * Header for EntryListPage, in both its single-class and combined A/B modes.
 * Displays class information, status indicators, and action menus.
 */
export const EntryListHeader: React.FC<EntryListHeaderProps> = ({
  classInfo,
  isRefreshing,
  isSyncing,
  hasError,
  pendingCount,
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

  const closeInfoPopup = React.useCallback(() => {
    setShowInfoPopup(false);
  }, []);

  const toggleInfoPopup = React.useCallback(() => {
    setShowInfoPopup(currentlyOpen => !currentlyOpen);
  }, []);

  // Close menus when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('[data-actions-menu]')) {
        setShowActionsMenu(false);
      }
      if (!target.closest('[data-class-info-trigger]')) {
        closeInfoPopup();
      }
    };

    if (showActionsMenu || showInfoPopup) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [closeInfoPopup, showActionsMenu, showInfoPopup]);

  const trialInfoText = buildTrialInfoText(classInfo);

  // Check if there's extra info to show in popup
  const statusBadge = getStatusBadge(classInfo?.classStatus);
  const hasExtraInfo = Boolean(
    classInfo?.judgeName || statusBadge || (showSectionsBadge && classInfo?.judgeNameB)
  );

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
      // `ClassInfo.timeLimit` is a host-built display string ("180s"); parse it
      // back to numeric seconds. `parseTimeLimit` collapses any non-numeric value
      // ("TBD") to `undefined` rather than emitting NaN — NaN is `typeof 'number'`
      // and would slip past the popover's `typeof === 'number'` guard as "NaNs".
      timeLimitSeconds: parseTimeLimit(classInfo.timeLimit),
      timeLimitArea2Seconds: parseTimeLimit(classInfo.timeLimit2),
      timeLimitArea3Seconds: parseTimeLimit(classInfo.timeLimit3),
      areaCount: classInfo.areas,
      visibilityPreset: classInfo.visibilityPreset,
      selfCheckinEnabled: classInfo.selfCheckin,
      hidesKnown: classInfo.hidesKnown,
      distractionCount: classInfo.distractionCount,
    };
  }, [classInfo]);

  return (
    <header className="sticky top-0 z-10 flex min-h-[60px] items-center gap-2 rounded-b-xl border-b border-border bg-card p-3 sm:gap-4">
      <HamburgerMenu
        backNavigation={{
          label: 'Back to Classes',
          action: () => navigate(-1),
        }}
        currentPage="entries"
      />
      <CompactOfflineIndicator />
      {/* Class info - explicit tap/click or keyboard activation to show details popup */}
      <div
        ref={classInfoRef}
        data-class-info-trigger={hasExtraInfo ? '' : undefined}
        className={cn(
          'flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-md px-1.5 py-1 text-center md:absolute md:left-1/2 md:top-1/2 md:max-w-[55%] md:flex-none md:-translate-x-1/2 md:-translate-y-1/2',
          hasExtraInfo &&
            'group cursor-pointer transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
        )}
        onClick={hasExtraInfo ? toggleInfoPopup : undefined}
        role={hasExtraInfo ? 'button' : undefined}
        tabIndex={hasExtraInfo ? 0 : undefined}
        {...getClassInfoA11yProps(hasExtraInfo, showInfoPopup)}
        onKeyDown={
          hasExtraInfo ? event => handleClassInfoKeyDown(event, toggleInfoPopup) : undefined
        }
      >
        {/* Class name with small info indicator. On phones this row is always two title
            lines tall (2.5em at the title's own size and leading-tight 1.25) and the title
            clamps to two: the indicators beside it come and go with every background sync,
            and a title that rewrapped each time bounced the whole list under the sticky
            header (owner report, 2026-10-09). Sized in em, not px, so the app's text scale
            (text-base is 20px at ringside) cannot under-reserve it again. */}
        <div className="flex items-center justify-center gap-1 max-md:min-h-[2.5em] max-md:text-base">
          <h1 className="m-0 text-balance max-md:line-clamp-2 text-center text-base font-[590] leading-tight tracking-tight text-foreground md:whitespace-nowrap md:text-lg md:leading-none">
            {classInfo?.className?.toLowerCase().replace(/\b\w/g, l => l.toUpperCase()) ||
              'Loading...'}
          </h1>
          {hasExtraInfo && (
            <span
              className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-muted-foreground text-card opacity-60 transition-colors group-hover:bg-primary group-hover:opacity-100"
              aria-hidden="true"
            >
              <Info size={12} />
            </span>
          )}
        </div>
        {/* Trial date and number */}
        {trialInfoText && (
          <div className="flex w-full justify-center max-sm:hidden">
            <span className="min-w-0 truncate text-xs font-medium leading-tight text-muted-foreground">
              {trialInfoText}
            </span>
          </div>
        )}
      </div>
      {/* Class Details Popover - renders via portal */}
      {hasExtraInfo && popoverData && (
        <ClassDetailsPopover
          isOpen={showInfoPopup}
          onClose={closeInfoPopup}
          anchorRef={classInfoRef}
          position="bottom"
          showJudgeB={showSectionsBadge}
          data={popoverData}
        />
      )}

      <div className="relative z-[100] ml-auto flex shrink-0 items-center gap-2">
        {/* Phones: the refresh button's spinning icon already says this. */}
        {isRefreshing && (
          <span className="max-sm:sr-only">
            <RefreshIndicator isRefreshing={isRefreshing} />
          </span>
        )}

        {isSyncing && <SyncIndicator status="syncing" compact pendingCount={pendingCount} />}
        {hasError && <SyncIndicator status="error" compact errorMessage="Sync failed" />}
        {/* Idle but with queued writes: show "N waiting to sync" so a judge can
            tell whether it's safe to close the iPad, not just while a sync is
            actively running (audit H3). */}
        {!isSyncing && !hasError && typeof pendingCount === 'number' && pendingCount > 0 && (
          <SyncIndicator status="pending" compact pendingCount={pendingCount} />
        )}

        {/* Filter button */}
        <FilterTriggerButton onClick={onFilterClick} hasActiveFilters={hasActiveFilters} />

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
