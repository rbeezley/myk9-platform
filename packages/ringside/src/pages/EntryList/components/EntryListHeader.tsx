/**
 * EntryListHeader — page header for the EntryList page.
 *
 * Host coupling is limited to the injected primitives (CompactOfflineIndicator,
 * SyncIndicator, RefreshIndicator, FilterTriggerButton, ClassDetailsPopover) and
 * the host's menu slot. `useNavigate` comes from `react-router-dom`, a ringside
 * peer dependency.
 *
 * Layout (MYK9-1697, owner decisions D3, D6, D7):
 *  - ONE pinned bar: the host menu then Up on the left (MYK9-1770); sync state,
 *    filter and refresh on the right. The header has no menu of its own: the class actions
 *    (run order, max time, class options, placements) are handed to the host's
 *    menu, so there is one menu button, not ⋮ beside ☰.
 *  - The class name is pinned with the bar (its own line on phones, in the bar's
 *    middle from sm, in flow so a status chip beside Up can never overlap it) and
 *    wraps rather than truncates.
 *  - The trial date and ring phase sit under the pinned part and scroll away.
 */

import React, { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Info, RefreshCw } from 'lucide-react';
import { cn, RingsideUpButton } from '@myk9/ui';
import { formatTrialDate, formatTrialLabel } from '@myk9/core';
import type { ComponentType } from 'react';
import type { ClassInfo } from '../hooks/useEntryListData';
import {
  buildClassMenuActions,
  getStatusBadge,
  type ActionsMenuConfig,
} from './entryListHeaderHelpers';
import { parseTimeLimit } from '../entryListHelpers';
import type {
  CompactOfflineIndicatorProps,
  SyncIndicatorProps,
  RefreshIndicatorProps,
  FilterTriggerButtonProps,
  ClassDetailsPopoverProps,
  EntryListMenuSlot,
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

/** The class details popover's data, or null before the class has loaded. */
function buildPopoverData(classInfo: ClassInfo | null): ClassDetailsPopoverProps['data'] | null {
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
    statusLabel: classInfo.statusLabel,
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
}

/** Refresh / sync / queued-write state beside the bar's buttons. */
function HeaderSyncState({
  isRefreshing,
  isSyncing,
  hasError,
  pendingCount,
  RefreshIndicator,
  SyncIndicator,
}: {
  isRefreshing: boolean;
  isSyncing: boolean;
  hasError: boolean;
  pendingCount: number | undefined;
  RefreshIndicator: ComponentType<RefreshIndicatorProps>;
  SyncIndicator: ComponentType<SyncIndicatorProps>;
}) {
  return (
    <>
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
    </>
  );
}

/**
 * Trial date and ring phase: under the pinned bar, scrolling with the list
 * (D7). The ring phase keeps its own wrapping line so a Briefing / Break /
 * Offline Scoring time stays readable (MYK9-1526).
 */
function TrialLine({
  trialInfoText,
  statusLabel,
}: {
  trialInfoText: string;
  statusLabel: string | null | undefined;
}) {
  if (!trialInfoText && !statusLabel) return null;
  return (
    <div className="flex flex-col items-center gap-0.5 px-3 pt-2 text-center">
      {trialInfoText && (
        <span className="text-sm font-medium leading-tight text-muted-foreground">
          {trialInfoText}
        </span>
      )}
      {statusLabel && (
        <span className="text-balance text-sm font-semibold leading-tight text-foreground">
          {statusLabel}
        </span>
      )}
    </div>
  );
}

/** Same 48px round target as the class list's refresh (gloved taps, INTENT s.6). */
const REFRESH_BUTTON_CLASS =
  'inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60';

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
  /** The Up control's label and fixed parent route (MYK9-1500). */
  up: { label: string; to: string };
  /**
   * Host-rendered menu control, shown first in the bar, before Up (MYK9-1508, MYK9-1770). A
   * function receives this class's actions to list (MYK9-1697).
   */
  menu?: EntryListMenuSlot;
  /** What this viewer may do to the class; handed to `menu` as a list. */
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
  CompactOfflineIndicator: ComponentType<CompactOfflineIndicatorProps>;
  SyncIndicator: ComponentType<SyncIndicatorProps>;
  RefreshIndicator: ComponentType<RefreshIndicatorProps>;
  FilterTriggerButton: ComponentType<FilterTriggerButtonProps>;
  ClassDetailsPopover: ComponentType<ClassDetailsPopoverProps>;
}

/**
 * Header for EntryListPage, in both its single-class and combined A/B modes.
 * Displays class information, status indicators, and the host menu.
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
  up,
  menu,
  showSectionsBadge = false,
  refreshLongPressHandlers,
  CompactOfflineIndicator,
  SyncIndicator,
  RefreshIndicator,
  FilterTriggerButton,
  ClassDetailsPopover,
}) => {
  const navigate = useNavigate();
  const [showInfoPopup, setShowInfoPopup] = React.useState(false);
  const classInfoRef = useRef<HTMLDivElement>(null);

  const closeInfoPopup = React.useCallback(() => {
    setShowInfoPopup(false);
  }, []);

  const toggleInfoPopup = React.useCallback(() => {
    setShowInfoPopup(currentlyOpen => !currentlyOpen);
  }, []);

  // Close the class details popup when clicking outside it
  React.useEffect(() => {
    if (!showInfoPopup) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('[data-class-info-trigger]')) closeInfoPopup();
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [closeInfoPopup, showInfoPopup]);

  const trialInfoText = buildTrialInfoText(classInfo);

  // Check if there's extra info to show in popup
  const statusBadge = getStatusBadge(classInfo?.classStatus);
  const hasExtraInfo = Boolean(
    classInfo?.judgeName ||
    statusBadge ||
    classInfo?.statusLabel ||
    (showSectionsBadge && classInfo?.judgeNameB)
  );

  const popoverData = React.useMemo(() => buildPopoverData(classInfo), [classInfo]);

  const menuControl = typeof menu === 'function' ? menu(buildClassMenuActions(actionsMenu)) : menu;

  return (
    <>
      <header className="sticky top-0 z-10 flex min-h-[60px] items-center gap-2 max-sm:flex-wrap max-sm:gap-y-0 rounded-b-xl border-b border-border bg-card p-3 max-sm:py-1.5 sm:gap-4">
        {/* MYK9-1770: the host menu sits first, Up beside it, top-left on every ringside screen. */}
        <div className="flex shrink-0 items-center gap-2" data-testid="entry-list-header-left">
          {menuControl}
          <RingsideUpButton label={up.label} onClick={() => navigate(up.to)} />
        </div>
        <CompactOfflineIndicator />
        {/* Class name: pinned with the bar (D7). Phones give it its own line under
            the bar; it wraps there instead of clamping, and since that line is
            always full width a sync indicator coming and going beside the bar
            cannot rewrap it (the 2026-10-09 bounce). Tap or keyboard opens the
            class details. */}
        <div
          ref={classInfoRef}
          data-class-info-trigger={hasExtraInfo ? '' : undefined}
          className={cn(
            'flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1 rounded-md px-1.5 py-1 text-center max-sm:order-last max-sm:basis-full',
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
          <h1 className="m-0 min-w-0 break-words text-balance text-center text-base font-[590] leading-tight tracking-tight text-foreground md:text-lg">
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

        <div className="relative z-[100] ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
          <HeaderSyncState
            isRefreshing={isRefreshing}
            isSyncing={isSyncing}
            hasError={hasError}
            pendingCount={pendingCount}
            RefreshIndicator={RefreshIndicator}
            SyncIndicator={SyncIndicator}
          />

          <FilterTriggerButton onClick={onFilterClick} hasActiveFilters={hasActiveFilters} />

          {/* Refresh, in the same place as on the class list (D3). Long press
              reloads the whole page. */}
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            aria-label="Refresh entries"
            title="Refresh (long press for full reload)"
            className={REFRESH_BUTTON_CLASS}
            {...refreshLongPressHandlers}
          >
            <RefreshCw
              size={20}
              aria-hidden
              className={cn(isRefreshing && 'animate-spin motion-reduce:animate-none')}
            />
          </button>
        </div>
      </header>
      <TrialLine trialInfoText={trialInfoText} statusLabel={classInfo?.statusLabel} />
    </>
  );
};

export default EntryListHeader;
