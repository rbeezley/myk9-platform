import React, { Dispatch, SetStateAction } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { usePermission } from '../../../hooks/usePermission';
import { CheckinStatusDialog } from '../../../components/dialogs/CheckinStatusDialog';
import { RunOrderDialog, RunOrderPreset } from '../../../components/dialogs/RunOrderDialog';
import { ClassOptionsDialog } from '../../../components/dialogs/ClassOptionsDialog';
import { ClassRequirementsDialog } from '../../../components/dialogs/ClassRequirementsDialog';
import { MaxTimeDialog } from '../../../components/dialogs/MaxTimeDialog';
import { ClassSettingsDialog } from '../../../components/dialogs/ClassSettingsDialog';
import { NoStatsDialog } from '../../../components/dialogs/NoStatsDialog';
import { ClassStatusDialog } from '../../../components/dialogs/ClassStatusDialog';
import { AreaCountSelectionDialog, AreaCountRequirements } from '../../../components/dialogs/AreaCountSelectionDialog';
import { parseOrganizationData, hasRuleDefinedMaxTimes } from '../../../utils/organizationUtils';
import { Entry } from '../../../stores/entryStore';
import {
  ResetConfirmDialog,
  SelfCheckinDisabledDialog,
  ResetMenuPopup,
} from './index';
import type { ClassInfo } from '../hooks';

export interface EntryListDialogsProps {
  classId: string | undefined;
  classInfo: ClassInfo | null;
  localEntries: Entry[];
  completedEntries: Entry[];

  // Checkin status dialog
  activeStatusPopup: number | null;
  setActiveStatusPopup: Dispatch<SetStateAction<number | null>>;
  handleStatusChange: (entryId: number, status: NonNullable<Entry['checkinStatus']> | 'in-ring' | 'completed') => Promise<void>;

  // Run order dialog
  runOrderDialogOpen: boolean;
  setRunOrderDialogOpen: Dispatch<SetStateAction<boolean>>;
  handleApplyRunOrder: (preset: RunOrderPreset) => Promise<void>;
  handleOpenDragMode: () => void;

  // Class options dialog
  classOptionsDialogOpen: boolean;
  setClassOptionsDialogOpen: Dispatch<SetStateAction<boolean>>;
  setRequirementsDialogOpen: Dispatch<SetStateAction<boolean>>;
  setMaxTimeDialogOpen: Dispatch<SetStateAction<boolean>>;
  setSettingsDialogOpen: Dispatch<SetStateAction<boolean>>;
  setStatusDialogOpen: Dispatch<SetStateAction<boolean>>;
  handleStatisticsClick: () => void | false;
  handlePrintCheckIn: () => void;
  handlePrintResults: () => void;
  handlePrintScoresheet: () => void;

  // Class requirements dialog
  requirementsDialogOpen: boolean;

  // Max time dialog
  maxTimeDialogOpen: boolean;
  maxTimeRequiredWarning: boolean;
  setMaxTimeRequiredWarning: Dispatch<SetStateAction<boolean>>;
  refresh: (forceSync?: boolean) => Promise<void>;

  // Class settings dialog
  settingsDialogOpen: boolean;

  // No stats dialog
  noStatsDialogOpen: boolean;
  setNoStatsDialogOpen: Dispatch<SetStateAction<boolean>>;

  // Class status dialog
  statusDialogOpen: boolean;
  handleStatusDialogChange: (status: string, timeValue?: string) => Promise<void>;

  // Area count dialog
  areaCountDialogOpen: boolean;
  setAreaCountDialogOpen: Dispatch<SetStateAction<boolean>>;
  areaCountRequirements: AreaCountRequirements | null;

  // Reset menu
  activeResetMenu: number | null;
  resetMenuPosition: { top: number; left: number } | null;
  handleResetScore: (entry: Entry) => void;
  closeResetMenu: () => void;

  // Reset confirm dialog
  resetConfirmDialog: { show: boolean; entry: Entry | null };
  confirmResetScore: () => Promise<void>;
  cancelResetScore: () => void;

  // Self checkin disabled dialog
  selfCheckinDisabledDialog: boolean;
  setSelfCheckinDisabledDialog: Dispatch<SetStateAction<boolean>>;
}

export const EntryListDialogs: React.FC<EntryListDialogsProps> = ({
  classId,
  classInfo,
  localEntries,
  completedEntries,
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
}) => {
  const navigate = useNavigate();
  const { showContext } = useAuth();
  const { hasPermission, hasRole } = usePermission();
  const canModifyClassSettings = hasRole(['admin', 'judge']);

  return (
    <>
      <CheckinStatusDialog
        isOpen={activeStatusPopup !== null}
        onClose={() => setActiveStatusPopup(null)}
        onStatusChange={(status) => {
          if (activeStatusPopup !== null) {
            handleStatusChange(activeStatusPopup, status);
          }
        }}
        dogInfo={{
          armband: localEntries.find(e => e.id === activeStatusPopup)?.armband || 0,
          callName: localEntries.find(e => e.id === activeStatusPopup)?.callName || '',
          handler: localEntries.find(e => e.id === activeStatusPopup)?.handler || ''
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
            id: Number(classId),
            element: classInfo.element,
            level: classInfo.level,
            class_name: classInfo.className,
            entry_count: localEntries.length,
            completed_count: completedEntries.length,
            class_status: classInfo.classStatus
          }}
          onRequirements={() => { setRequirementsDialogOpen(true); return false; }}
          onSetMaxTime={() => { setMaxTimeDialogOpen(true); return false; }}
          onSettings={() => { setSettingsDialogOpen(true); return false; }}
          onStatistics={handleStatisticsClick}
          onStatus={() => { setStatusDialogOpen(true); return false; }}
          onPrintCheckIn={handlePrintCheckIn}
          onPrintResults={handlePrintResults}
          onPrintScoresheet={handlePrintScoresheet}
          hideMaxTime={hasRuleDefinedMaxTimes(parseOrganizationData(showContext?.org || '')) || !canModifyClassSettings}
          hideSettings={!canModifyClassSettings}
        />
      )}

      {classInfo && (
        <ClassRequirementsDialog
          isOpen={requirementsDialogOpen}
          onClose={() => setRequirementsDialogOpen(false)}
          onSetMaxTime={hasRuleDefinedMaxTimes(parseOrganizationData(showContext?.org || '')) || !canModifyClassSettings ? undefined : () => {
            setRequirementsDialogOpen(false);
            setMaxTimeDialogOpen(true);
          }}
          classData={{
            id: Number(classId),
            element: classInfo.element,
            level: classInfo.level,
            class_name: classInfo.className,
            entry_count: localEntries.length
          }}
        />
      )}

      {classInfo && (
        <MaxTimeDialog
          isOpen={maxTimeDialogOpen}
          onClose={() => {
            setMaxTimeDialogOpen(false);
            if (maxTimeRequiredWarning) {
              setMaxTimeRequiredWarning(false);
              navigate(-1);
            }
          }}
          showWarning={maxTimeRequiredWarning}
          classData={{
            id: Number(classId),
            element: classInfo.element,
            level: classInfo.level,
            class_name: classInfo.className,
            time_limit_seconds: classInfo.timeLimit ? parseInt(classInfo.timeLimit) : undefined,
            time_limit_area2_seconds: classInfo.timeLimit2 ? parseInt(classInfo.timeLimit2) : undefined,
            time_limit_area3_seconds: classInfo.timeLimit3 ? parseInt(classInfo.timeLimit3) : undefined,
            area_count: classInfo.areas
          }}
          onTimeUpdate={refresh}
        />
      )}

      {classInfo && (
        <ClassSettingsDialog
          isOpen={settingsDialogOpen}
          onClose={() => setSettingsDialogOpen(false)}
          classData={{
            id: Number(classId),
            element: classInfo.element,
            level: classInfo.level,
            class_name: classInfo.className,
            self_checkin_enabled: classInfo.selfCheckin
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
            id: Number(classId),
            element: classInfo.element,
            level: classInfo.level,
            class_name: classInfo.className,
            class_status: classInfo.classStatus || 'no-status',
            entry_count: localEntries.length
          }}
          currentStatus={classInfo.classStatus || 'no-status'}
        />
      )}

      {classInfo && areaCountRequirements && (
        <AreaCountSelectionDialog
          isOpen={areaCountDialogOpen}
          onClose={() => {
            setAreaCountDialogOpen(false);
            navigate(-1);
          }}
          classData={{
            id: Number(classId),
            element: classInfo.element,
            level: classInfo.level,
            class_name: classInfo.className
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
