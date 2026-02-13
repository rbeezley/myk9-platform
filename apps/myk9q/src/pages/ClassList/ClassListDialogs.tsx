import React from 'react';
import { ClassRequirementsDialog } from '../../components/dialogs/ClassRequirementsDialog';
import { MaxTimeDialog } from '../../components/dialogs/MaxTimeDialog';
import { ClassStatusDialog } from '../../components/dialogs/ClassStatusDialog';
import { ClassSettingsDialog } from '../../components/dialogs/ClassSettingsDialog';
import { NoEntriesDialog } from '../../components/dialogs/NoEntriesDialog';
import { NoStatsDialog } from '../../components/dialogs/NoStatsDialog';
import { ClassOptionsDialog } from '../../components/dialogs/ClassOptionsDialog';
import { FilterPanel } from '../../components/ui';
import { parseOrganizationData, hasRuleDefinedMaxTimes } from '../../utils/organizationUtils';
import { markUnscoredEntriesAsAbsent } from '@/services/entryService';
import type { ClassEntry } from './hooks/useClassListData';

interface ClassListDialogsProps {
  trialId: string | undefined;
  organization: string;
  canModifyClassSettings: boolean;
  navigate: (path: string) => void;

  // ClassOptionsDialog
  activePopup: number | null;
  classes: ClassEntry[];
  setActivePopup: (id: number | null) => void;
  handleGenerateCheckIn: (classId: number) => void;
  handleGenerateResults: (classId: number) => void;
  handleGenerateScoresheet: (classId: number) => void;

  // Requirements dialog
  requirementsDialogOpen: boolean;
  selectedClassForRequirements: ClassEntry | null;
  setRequirementsDialogOpen: (open: boolean) => void;
  setSelectedClassForRequirements: (cls: ClassEntry | null) => void;

  // Max time dialog
  maxTimeDialogOpen: boolean;
  showMaxTimeWarning: boolean;
  selectedClassForMaxTime: ClassEntry | null;
  setMaxTimeDialogOpen: (open: boolean) => void;
  setSelectedClassForMaxTime: (cls: ClassEntry | null) => void;
  setShowMaxTimeWarning: (show: boolean) => void;

  // Status dialog
  statusDialogOpen: boolean;
  selectedClassForStatus: ClassEntry | null;
  setStatusDialogOpen: (open: boolean) => void;
  setSelectedClassForStatus: (cls: ClassEntry | null) => void;
  handleClassStatusChange: (classId: number, status: ClassEntry['class_status']) => void;
  handleClassStatusChangeWithTime: (classId: number, status: ClassEntry['class_status'], timeValue: string) => void;

  // Settings dialog
  settingsDialogOpen: boolean;
  selectedClassForSettings: ClassEntry | null;
  setSettingsDialogOpen: (open: boolean) => void;
  setSelectedClassForSettings: (cls: ClassEntry | null) => void;

  // No entries dialog
  noEntriesDialogOpen: boolean;
  noEntriesClassName: string | undefined;
  setNoEntriesDialogOpen: (open: boolean) => void;
  setNoEntriesClassName: (name: string | undefined) => void;

  // No stats dialog
  noStatsDialogOpen: boolean;
  noStatsClassName: string | undefined;
  setNoStatsDialogOpen: (open: boolean) => void;
  setNoStatsClassName: (name: string | undefined) => void;

  // Filter panel
  isFilterPanelOpen: boolean;
  setIsFilterPanelOpen: (open: boolean) => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  sortOptions: { value: string; label: string }[];
  sortOrder: string;
  setSortOrder: (order: 'class_order' | 'element_level' | 'level_element') => void;
  filteredClassCount: number;
  totalClassCount: number;

  refetch: () => void;
}

export const ClassListDialogs: React.FC<ClassListDialogsProps> = ({
  trialId,
  organization,
  canModifyClassSettings,
  navigate,
  activePopup,
  classes,
  setActivePopup,
  handleGenerateCheckIn,
  handleGenerateResults,
  handleGenerateScoresheet,
  requirementsDialogOpen,
  selectedClassForRequirements,
  setRequirementsDialogOpen,
  setSelectedClassForRequirements,
  maxTimeDialogOpen,
  showMaxTimeWarning,
  selectedClassForMaxTime,
  setMaxTimeDialogOpen,
  setSelectedClassForMaxTime,
  setShowMaxTimeWarning,
  statusDialogOpen,
  selectedClassForStatus,
  setStatusDialogOpen,
  setSelectedClassForStatus,
  handleClassStatusChange,
  handleClassStatusChangeWithTime,
  settingsDialogOpen,
  selectedClassForSettings,
  setSettingsDialogOpen,
  setSelectedClassForSettings,
  noEntriesDialogOpen,
  noEntriesClassName,
  setNoEntriesDialogOpen,
  setNoEntriesClassName,
  noStatsDialogOpen,
  noStatsClassName,
  setNoStatsDialogOpen,
  setNoStatsClassName,
  isFilterPanelOpen,
  setIsFilterPanelOpen,
  searchTerm,
  setSearchTerm,
  sortOptions,
  sortOrder,
  setSortOrder,
  filteredClassCount,
  totalClassCount,
  refetch,
}) => {
  const selectedClass = activePopup !== null ? classes.find(c => c.id === activePopup) : null;
  const orgData = parseOrganizationData(organization);

  return (
    <>
      {/* Class Options Dialog */}
      <ClassOptionsDialog
        isOpen={activePopup !== null}
        onClose={() => setActivePopup(null)}
        classData={selectedClass ? {
          id: selectedClass.id,
          element: selectedClass.element,
          level: selectedClass.level,
          class_name: selectedClass.class_name,
          entry_count: selectedClass.entry_count,
          completed_count: selectedClass.completed_count,
          class_status: selectedClass.class_status
        } : null}
        onRequirements={() => {
          if (selectedClass) {
            setSelectedClassForRequirements(selectedClass);
            setRequirementsDialogOpen(true);
          }
          return false;
        }}
        onSetMaxTime={() => {
          if (selectedClass) {
            setSelectedClassForMaxTime(selectedClass);
            setMaxTimeDialogOpen(true);
            setShowMaxTimeWarning(false);
          }
          return false;
        }}
        onSettings={() => {
          if (selectedClass) {
            setSelectedClassForSettings(selectedClass);
            setSettingsDialogOpen(true);
          }
          return false;
        }}
        onStatistics={() => {
          if (trialId && selectedClass) {
            if (selectedClass.completed_count === 0) {
              setNoStatsClassName(selectedClass.class_name);
              setNoStatsDialogOpen(true);
              return false;
            }
            navigate(`/stats/trial/${trialId}?classId=${selectedClass.id}`);
          }
        }}
        onStatus={() => {
          if (selectedClass) {
            setSelectedClassForStatus(selectedClass);
            setStatusDialogOpen(true);
          }
          return false;
        }}
        onPrintCheckIn={() => {
          if (selectedClass) {
            handleGenerateCheckIn(selectedClass.id);
          }
        }}
        onPrintResults={() => {
          if (selectedClass) {
            handleGenerateResults(selectedClass.id);
          }
        }}
        onPrintScoresheet={() => {
          if (selectedClass) {
            handleGenerateScoresheet(selectedClass.id);
          }
        }}
        hideMaxTime={hasRuleDefinedMaxTimes(orgData) || !canModifyClassSettings}
        hideSettings={!canModifyClassSettings}
      />

      {/* Class Requirements Dialog */}
      <ClassRequirementsDialog
        isOpen={requirementsDialogOpen}
        onClose={() => {
          setRequirementsDialogOpen(false);
          setSelectedClassForRequirements(null);
        }}
        onSetMaxTime={hasRuleDefinedMaxTimes(parseOrganizationData(organization)) || !canModifyClassSettings ? undefined : () => {
          setRequirementsDialogOpen(false);
          setSelectedClassForMaxTime(selectedClassForRequirements);
          setMaxTimeDialogOpen(true);
          setShowMaxTimeWarning(false);
        }}
        classData={selectedClassForRequirements || {
          id: 0,
          element: '',
          level: '',
          class_name: '',
          entry_count: 0
        }}
      />

      {/* Max Time Dialog */}
      <MaxTimeDialog
        isOpen={maxTimeDialogOpen}
        showWarning={showMaxTimeWarning}
        onClose={() => {
          setMaxTimeDialogOpen(false);
          setSelectedClassForMaxTime(null);
          setShowMaxTimeWarning(false);
        }}
        classData={selectedClassForMaxTime || {
          id: 0,
          element: '',
          level: '',
          class_name: ''
        }}
        onTimeUpdate={() => {
          refetch();
        }}
      />

      {/* Class Status Dialog */}
      <ClassStatusDialog
        isOpen={statusDialogOpen}
        onClose={() => {
          setStatusDialogOpen(false);
          setSelectedClassForStatus(null);
        }}
        onStatusChange={(status: string, timeValue?: string) => {
          if (selectedClassForStatus) {
            const typedStatus = status as ClassEntry['class_status'];
            if (timeValue) {
              handleClassStatusChangeWithTime(selectedClassForStatus.id, typedStatus, timeValue);
            } else {
              handleClassStatusChange(selectedClassForStatus.id, typedStatus);
            }
          }
        }}
        classData={selectedClassForStatus ? {
          id: selectedClassForStatus.id,
          element: selectedClassForStatus.element,
          level: selectedClassForStatus.level,
          class_name: selectedClassForStatus.class_name,
          class_status: selectedClassForStatus.class_status,
          entry_count: selectedClassForStatus.entry_count,
          scored_count: selectedClassForStatus.completed_count,
          briefing_time: selectedClassForStatus.briefing_time,
          break_until_time: selectedClassForStatus.break_until,
          start_time: selectedClassForStatus.start_time
        } : {
          id: 0,
          element: '',
          level: '',
          class_name: '',
          class_status: '',
          entry_count: 0,
          scored_count: 0,
          briefing_time: undefined,
          break_until_time: undefined,
          start_time: undefined
        }}
        currentStatus={selectedClassForStatus?.class_status || ''}
        onMarkAbsent={selectedClassForStatus ? async () => {
          const classIds = selectedClassForStatus.pairedClassId
            ? [selectedClassForStatus.id, selectedClassForStatus.pairedClassId]
            : [selectedClassForStatus.id];

          await markUnscoredEntriesAsAbsent(classIds);
          await refetch();
        } : undefined}
      />

      {/* Class Settings Dialog */}
      <ClassSettingsDialog
        isOpen={settingsDialogOpen}
        onClose={() => {
          setSettingsDialogOpen(false);
          setSelectedClassForSettings(null);
        }}
        classData={selectedClassForSettings || {
          id: 0,
          element: '',
          level: '',
          class_name: '',
          self_checkin_enabled: true
        }}
        onSettingsUpdate={() => {
          refetch();
        }}
      />

      {/* No Entries Dialog */}
      <NoEntriesDialog
        isOpen={noEntriesDialogOpen}
        onClose={() => {
          setNoEntriesDialogOpen(false);
          setNoEntriesClassName(undefined);
        }}
        className={noEntriesClassName}
      />

      {/* No Stats Dialog */}
      <NoStatsDialog
        isOpen={noStatsDialogOpen}
        onClose={() => {
          setNoStatsDialogOpen(false);
          setNoStatsClassName(undefined);
        }}
        className={noStatsClassName}
      />

      {/* Filter Panel Slide-out */}
      <FilterPanel
        isOpen={isFilterPanelOpen}
        onClose={() => setIsFilterPanelOpen(false)}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search classes..."
        sortOptions={sortOptions}
        sortOrder={sortOrder}
        onSortChange={(order) => setSortOrder(order as 'class_order' | 'element_level' | 'level_element')}
        resultsLabel={`${filteredClassCount} of ${totalClassCount} classes`}
        title="Search & Sort Classes"
      />
    </>
  );
};
