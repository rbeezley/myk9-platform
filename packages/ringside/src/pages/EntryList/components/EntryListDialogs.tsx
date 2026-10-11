/**
 * EntryListDialogs — dialog cluster for the single-class EntryList page.
 *
 * Moved into @myk9/ringside in PR E2d-2b. Host coupling reduced to:
 *  - 9 dialog components are now required slot props (`dialogs` bag):
 *    CheckinStatusDialog, RunOrderDialog, ClassOptionsDialog,
 *    ClassRequirementsDialog, MaxTimeDialog, ClassSettingsDialog,
 *    NoStatsDialog, ClassStatusDialog, AreaCountSelectionDialog.
 *  - `useAuth` is dropped entirely — `showContext` only existed to
 *    feed organizationUtils chains, which now happen in the shim and
 *    arrive as precomputed booleans (`hideMaxTimeOption`,
 *    `hideSettingsOption`).
 *  - `hasRole` is dropped — `canModifyClassSettings` is derived in
 *    the shim and surfaces as the two boolean props above.
 *  - `hasPermission` (one callsite for `'canScore'`) is now a prop
 *    typed against the narrow `EntryListPermission` union.
 *  - `useNavigate` is kept — `react-router-dom` is now a ringside
 *    peer dep.
 *  - `AreaCountRequirements` now imports from ringside's `dialogSlots`
 *    (was a host dialog re-export).
 *  - 3 leaf components (ResetMenuPopup, ResetConfirmDialog,
 *    SelfCheckinDisabledDialog) are direct sibling imports — already
 *    in ringside since PR E2d-2a.
 */

import React, { Dispatch, SetStateAction, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ComponentType } from 'react';
import type { Entry } from '../../../stores/entryStore';
import type { ClassInfo } from '../hooks/useEntryListData';
import type { EntryListPermission } from '../permissions';
import type {
  CheckinStatusDialogProps,
  RunOrderDialogProps,
  ClassOptionsDialogProps,
  ClassRequirementsDialogProps,
  MaxTimeDialogProps,
  MaxTimeClassData,
  ClassSettingsDialogProps,
  NoStatsDialogProps,
  ClassStatusDialogProps,
  AreaCountSelectionDialogProps,
  RunOrderPreset,
  AreaCountRequirements,
} from '../dialogSlots';
import { ResetConfirmDialog, ResetMenuPopup, SelfCheckinDisabledDialog } from './index';
import { classDialogCounts } from './classDialogCounts';

/** "180s" → 180; absent → undefined. */
const toSeconds = (value: string | undefined) => (value ? parseInt(value) : undefined);

/**
 * The class the max-time dialog acts on. A combined A/B list has no single class
 * id: it is class A, with class B as its pair, so one save sets both (MYK9-1086).
 */
function maxTimeClassData(
  classInfo: ClassInfo,
  classId: string | undefined,
  combinedClassIds: { a: string; b: string } | undefined
): MaxTimeClassData {
  return {
    id: combinedClassIds?.a ?? classId ?? '',
    ...(combinedClassIds && { pairedClassId: combinedClassIds.b }),
    element: classInfo.element,
    level: classInfo.level,
    // Name both sections: one save sets both, and "…Novice A" alone reads as A only.
    class_name: combinedClassIds
      ? `${classInfo.element} ${classInfo.level} A & B`
      : classInfo.className,
    time_limit_seconds: toSeconds(classInfo.timeLimit),
    time_limit_area2_seconds: toSeconds(classInfo.timeLimit2),
    time_limit_area3_seconds: toSeconds(classInfo.timeLimit3),
    area_count: classInfo.areas,
  };
}

export interface EntryListDialogsProps {
  classId: string | undefined;
  /** A combined A/B list: max time is set on both of its classes. */
  combined?: { classIds: { a: string; b: string } } | undefined;
  classInfo: ClassInfo | null;
  localEntries: Entry[];

  // Permission predicate over narrow EntryList union.
  hasPermission: (permission: EntryListPermission) => boolean;

  /**
   * True when the user cannot modify the class-level "max time"
   * setting. Composed in the shim from
   * `hasRuleDefinedMaxTimes(orgData) || !canModifyClassSettings`.
   */
  hideMaxTimeOption: boolean;

  /**
   * True when the user cannot modify class settings (not admin/judge).
   * Used to hide the "Settings" menu option in ClassOptionsDialog.
   */
  hideSettingsOption: boolean;

  // ── Checkin status dialog ─────────────────────────────────────────
  activeStatusPopup: string | null;
  setActiveStatusPopup: Dispatch<SetStateAction<string | null>>;
  handleStatusChange: (
    entryId: string,
    status: NonNullable<Entry['checkinStatus']> | 'in-ring' | 'completed'
  ) => Promise<void>;

  // ── Run order dialog ──────────────────────────────────────────────
  runOrderDialogOpen: boolean;
  setRunOrderDialogOpen: Dispatch<SetStateAction<boolean>>;
  handleApplyRunOrder: (preset: RunOrderPreset) => Promise<void>;
  handleOpenDragMode: () => void;

  // ── Class options dialog ──────────────────────────────────────────
  classOptionsDialogOpen: boolean;
  setClassOptionsDialogOpen: Dispatch<SetStateAction<boolean>>;
  setRequirementsDialogOpen: Dispatch<SetStateAction<boolean>>;
  setMaxTimeDialogOpen: Dispatch<SetStateAction<boolean>>;
  setSettingsDialogOpen: Dispatch<SetStateAction<boolean>>;
  setStatusDialogOpen: Dispatch<SetStateAction<boolean>>;
  handleStatisticsClick: () => void | boolean;
  handlePrintCheckIn: () => void;
  handlePrintResults: () => void;
  handlePrintScoresheet: () => void;

  // ── Class requirements dialog ─────────────────────────────────────
  requirementsDialogOpen: boolean;

  // ── Max time dialog ───────────────────────────────────────────────
  maxTimeDialogOpen: boolean;
  maxTimeRequiredWarning: boolean;
  setMaxTimeRequiredWarning: Dispatch<SetStateAction<boolean>>;
  refresh: (forceSync?: boolean) => Promise<void>;

  // ── Class settings dialog ─────────────────────────────────────────
  settingsDialogOpen: boolean;

  // ── No stats dialog ───────────────────────────────────────────────
  noStatsDialogOpen: boolean;
  setNoStatsDialogOpen: Dispatch<SetStateAction<boolean>>;

  // ── Class status dialog ───────────────────────────────────────────
  statusDialogOpen: boolean;
  handleStatusDialogChange: (status: string, timeValue?: string) => Promise<void>;

  // ── Area count dialog ─────────────────────────────────────────────
  areaCountDialogOpen: boolean;
  setAreaCountDialogOpen: Dispatch<SetStateAction<boolean>>;
  areaCountRequirements: AreaCountRequirements | null;

  // ── Reset menu ────────────────────────────────────────────────────
  activeResetMenu: string | null;
  resetMenuPosition: { top: number; left: number } | null;
  handleResetScore: (entry: Entry) => void;
  closeResetMenu: () => void;

  // ── Reset confirm dialog ──────────────────────────────────────────
  resetConfirmDialog: { show: boolean; entry: Entry | null };
  confirmResetScore: () => Promise<void>;
  cancelResetScore: () => void;

  // ── Self checkin disabled dialog ──────────────────────────────────
  selfCheckinDisabledDialog: boolean;
  setSelfCheckinDisabledDialog: Dispatch<SetStateAction<boolean>>;

  // ── Host-injected dialog primitives ───────────────────────────────
  CheckinStatusDialog: ComponentType<CheckinStatusDialogProps>;
  RunOrderDialog: ComponentType<RunOrderDialogProps>;
  ClassOptionsDialog: ComponentType<ClassOptionsDialogProps>;
  ClassRequirementsDialog: ComponentType<ClassRequirementsDialogProps>;
  MaxTimeDialog: ComponentType<MaxTimeDialogProps>;
  ClassSettingsDialog: ComponentType<ClassSettingsDialogProps>;
  NoStatsDialog: ComponentType<NoStatsDialogProps>;
  ClassStatusDialog: ComponentType<ClassStatusDialogProps>;
  /** Optional — only renders when class has flexible area count. */
  AreaCountSelectionDialog?: ComponentType<AreaCountSelectionDialogProps>;
}

export const EntryListDialogs: React.FC<EntryListDialogsProps> = ({
  classId,
  combined,
  classInfo,
  localEntries,
  hasPermission,
  hideMaxTimeOption,
  hideSettingsOption,
  activeStatusPopup,
  setActiveStatusPopup,
  handleStatusChange,
  runOrderDialogOpen,
  setRunOrderDialogOpen,
  handleApplyRunOrder,
  handleOpenDragMode,
  classOptionsDialogOpen,
  setClassOptionsDialogOpen,
  setRequirementsDialogOpen,
  setMaxTimeDialogOpen,
  setSettingsDialogOpen,
  setStatusDialogOpen,
  handleStatisticsClick,
  handlePrintCheckIn,
  handlePrintResults,
  handlePrintScoresheet,
  requirementsDialogOpen,
  maxTimeDialogOpen,
  maxTimeRequiredWarning,
  setMaxTimeRequiredWarning,
  refresh,
  settingsDialogOpen,
  noStatsDialogOpen,
  setNoStatsDialogOpen,
  statusDialogOpen,
  handleStatusDialogChange,
  areaCountDialogOpen,
  setAreaCountDialogOpen,
  areaCountRequirements,
  activeResetMenu,
  resetMenuPosition,
  handleResetScore,
  closeResetMenu,
  resetConfirmDialog,
  confirmResetScore,
  cancelResetScore,
  selfCheckinDisabledDialog,
  setSelfCheckinDisabledDialog,
  CheckinStatusDialog,
  RunOrderDialog,
  ClassOptionsDialog,
  ClassRequirementsDialog,
  MaxTimeDialog,
  ClassSettingsDialog,
  NoStatsDialog,
  ClassStatusDialog,
  AreaCountSelectionDialog,
}) => {
  const navigate = useNavigate();
  // The max-time dialog closes after a save as well as on Cancel. Only a Cancel of
  // the "required before scoring" prompt leaves the list (myK9Q behaviour); after a
  // save the judge stays to score (MYK9-1099).
  const maxTimeSavedRef = useRef(false);
  const closeMaxTimeDialog = () => {
    setMaxTimeDialogOpen(false);
    if (maxTimeRequiredWarning) {
      setMaxTimeRequiredWarning(false);
      if (!maxTimeSavedRef.current) navigate(-1);
    }
    maxTimeSavedRef.current = false;
  };

  // The dialogs describe the SAME class the badges and the class header do, so
  // they report the host's expected/accounted pair rather than raw row counts
  // -- "66 entries" beside "Pending 65" was MYK9-646. `classDialogCounts` is
  // called inside each `{classInfo && ...}` block rather than hoisted here:
  // hoisting needs a nullable intermediate, and the only way to spend one at
  // the call site is a `?? <raw length>` or `?? 0` arm -- which is the silent
  // fallback this change exists to delete.

  return (
    <>
      <CheckinStatusDialog
        isOpen={activeStatusPopup !== null}
        onClose={() => setActiveStatusPopup(null)}
        onStatusChange={status => {
          if (activeStatusPopup !== null) {
            handleStatusChange(activeStatusPopup, status);
          }
        }}
        dogInfo={{
          armband: localEntries.find(e => e.id === activeStatusPopup)?.armband ?? null,
          callName: localEntries.find(e => e.id === activeStatusPopup)?.callName || '',
          handler: localEntries.find(e => e.id === activeStatusPopup)?.handler || '',
        }}
        showDescriptions={true}
        showRingManagement={hasPermission('canScore')}
      />

      <RunOrderDialog
        isOpen={runOrderDialogOpen}
        onClose={() => setRunOrderDialogOpen(false)}
        entries={localEntries}
        onApplyOrder={handleApplyRunOrder}
        onOpenDragMode={handleOpenDragMode}
      />

      {classInfo && (
        <ClassOptionsDialog
          isOpen={classOptionsDialogOpen}
          onClose={() => setClassOptionsDialogOpen(false)}
          classData={{
            id: classId ?? '',
            element: classInfo.element,
            level: classInfo.level,
            class_name: classInfo.className,
            ...classDialogCounts(classInfo),
            class_status: classInfo.classStatus,
          }}
          onRequirements={() => {
            setRequirementsDialogOpen(true);
            return false;
          }}
          onSetMaxTime={() => {
            setMaxTimeDialogOpen(true);
            return false;
          }}
          onSettings={() => {
            setSettingsDialogOpen(true);
            return false;
          }}
          onStatistics={handleStatisticsClick}
          onStatus={() => {
            setStatusDialogOpen(true);
            return false;
          }}
          onPrintCheckIn={handlePrintCheckIn}
          onPrintResults={handlePrintResults}
          onPrintScoresheet={handlePrintScoresheet}
          hideMaxTime={hideMaxTimeOption}
          hideSettings={hideSettingsOption}
        />
      )}

      {classInfo && (
        <ClassRequirementsDialog
          isOpen={requirementsDialogOpen}
          onClose={() => setRequirementsDialogOpen(false)}
          onSetMaxTime={
            hideMaxTimeOption
              ? undefined
              : () => {
                  setRequirementsDialogOpen(false);
                  setMaxTimeDialogOpen(true);
                }
          }
          classData={{
            id: classId ?? '',
            element: classInfo.element,
            level: classInfo.level,
            class_name: classInfo.className,
            entry_count: classDialogCounts(classInfo).entry_count,
          }}
        />
      )}

      {classInfo && (
        <MaxTimeDialog
          isOpen={maxTimeDialogOpen}
          onClose={closeMaxTimeDialog}
          showWarning={maxTimeRequiredWarning}
          classData={maxTimeClassData(classInfo, classId, combined?.classIds)}
          onTimeUpdate={() => {
            maxTimeSavedRef.current = true;
            refresh();
          }}
        />
      )}

      {classInfo && (
        <ClassSettingsDialog
          isOpen={settingsDialogOpen}
          onClose={() => setSettingsDialogOpen(false)}
          classData={{
            id: classId ?? '',
            element: classInfo.element,
            level: classInfo.level,
            class_name: classInfo.className,
            self_checkin_enabled: classInfo.selfCheckin,
          }}
          onSettingsUpdate={refresh}
        />
      )}

      <NoStatsDialog
        isOpen={noStatsDialogOpen}
        onClose={() => setNoStatsDialogOpen(false)}
        className={classInfo?.className || ''}
      />

      {classInfo && (
        <ClassStatusDialog
          isOpen={statusDialogOpen}
          onClose={() => setStatusDialogOpen(false)}
          onStatusChange={handleStatusDialogChange}
          classData={{
            id: classId ?? '',
            element: classInfo.element,
            level: classInfo.level,
            class_name: classInfo.className,
            class_status: classInfo.classStatus || 'no-status',
            entry_count: classDialogCounts(classInfo).entry_count,
          }}
          currentStatus={classInfo.classStatus || 'no-status'}
        />
      )}

      {AreaCountSelectionDialog && classInfo && areaCountRequirements && (
        <AreaCountSelectionDialog
          isOpen={areaCountDialogOpen}
          onClose={() => {
            setAreaCountDialogOpen(false);
            navigate(-1);
          }}
          classData={{
            id: classId ?? '',
            element: classInfo.element,
            level: classInfo.level,
            class_name: classInfo.className,
          }}
          areaCountRequirements={areaCountRequirements}
          onSave={() => {
            setAreaCountDialogOpen(false);
            refresh();
          }}
        />
      )}

      <ResetMenuPopup
        activeEntryId={activeResetMenu}
        position={resetMenuPosition}
        entries={localEntries}
        onResetScore={handleResetScore}
        onClose={closeResetMenu}
      />

      <ResetConfirmDialog
        isOpen={resetConfirmDialog.show}
        entry={resetConfirmDialog.entry}
        onConfirm={confirmResetScore}
        onCancel={cancelResetScore}
      />

      <SelfCheckinDisabledDialog
        isOpen={selfCheckinDisabledDialog}
        onClose={() => setSelfCheckinDisabledDialog(false)}
      />
    </>
  );
};
