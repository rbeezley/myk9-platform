/**
 * Results Control Tab
 *
 * Allows event organizers to control per-class results release
 * and self check-in settings. Adapted from CompetitionAdmin for use
 * as a tab within the Trial Secretary page.
 */

import React from 'react';
import { User } from 'lucide-react';

// Dialogs from Admin page
import { ConfirmationDialog } from '../../Admin/ConfirmationDialog';
import { SuccessDialog } from '../../Admin/SuccessDialog';

// Extracted hooks from Admin page
import {
  useAdminName,
  useBulkOperations,
  useCompetitionAdminData,
  useDialogs,
  useSelfCheckinSettings,
  useVisibilitySettings,
} from '../../Admin/hooks';

// Extracted components from Admin page
import {
  AdminNameDialog,
  ClassesList,
  ResultVisibilitySection,
  SelfCheckinSection,
} from '../../Admin/components';

// Utils
import { formatTrialDate } from '../../../utils/dateUtils';
import type { VisibilityPreset } from '../../../types/visibility';

// Styles
import '../../Admin/CompetitionAdmin.css';

interface ResultsControlTabProps {
  licenseKey: string;
  isReadOnly: boolean;
}

export const ResultsControlTab: React.FC<ResultsControlTabProps> = ({
  licenseKey,
  isReadOnly,
}) => {
  // Data fetching
  const { classes, trials, isLoading, isOffline, error: queryError, refetch } = useCompetitionAdminData(licenseKey);

  // Admin name management
  const { adminName, setAdminName, requireAdminName } = useAdminName();

  // Class selection and bulk operations
  const {
    selectedClasses,
    toggleClassSelection,
    selectAllClasses,
    clearSelection,
    handleBulkSetClassVisibility,
    handleBulkSetClassSelfCheckin,
  } = useBulkOperations();

  // Visibility settings
  const {
    showVisibilityPreset,
    trialVisibilitySettings,
    visibilitySectionExpanded,
    setVisibilitySectionExpanded,
    handleSetShowVisibility,
    handleSetTrialVisibility,
    handleRemoveTrialVisibility,
  } = useVisibilitySettings();

  // Self check-in settings
  const {
    showSelfCheckinEnabled,
    trialSelfCheckinSettings,
    checkinSectionExpanded,
    setCheckinSectionExpanded,
    handleSetShowSelfCheckin,
    handleSetTrialSelfCheckin,
    handleRemoveTrialSelfCheckin,
  } = useSelfCheckinSettings();

  // Dialog management
  const {
    confirmDialog,
    handleConfirmAction,
    handleCancelAction,
    successDialog,
    setSuccessDialog,
    closeSuccessDialog,
    adminNameDialog,
    tempAdminName,
    setTempAdminName,
    openAdminNameDialog,
    handleAdminNameSubmit,
    handleAdminNameCancel,
  } = useDialogs();

  // Helper to get trial label for messages
  const getTrialLabel = (trialId: number) => {
    const trial = trials.find(t => t.trial_id === trialId);
    return trial ? `${formatTrialDate(trial.trial_date)} • Trial ${trial.trial_number}` : `Trial ${trialId}`;
  };

  // Wrapped handlers that check admin name and show dialogs
  const onSetShowVisibility = async (preset: VisibilityPreset) => {
    if (!requireAdminName(() => openAdminNameDialog(adminName, () => onSetShowVisibility(preset)))) return;
    const result = await handleSetShowVisibility(preset, adminName, licenseKey);
    setSuccessDialog({
      isOpen: true,
      title: result.success ? 'Show Visibility Updated!' : 'Error',
      message: result.success
        ? `Result visibility set to "${preset.toUpperCase()}" for all classes in this show.`
        : result.error || 'Failed to update show visibility.',
      details: []
    });
  };

  const onSetTrialVisibility = async (trialId: number, preset: VisibilityPreset) => {
    if (!requireAdminName(() => openAdminNameDialog(adminName, () => onSetTrialVisibility(trialId, preset)))) return;
    const result = await handleSetTrialVisibility(trialId, preset, adminName, getTrialLabel(trialId));
    setSuccessDialog({
      isOpen: true,
      title: result.success ? 'Trial Visibility Updated!' : 'Error',
      message: result.success
        ? `Result visibility set to "${preset.toUpperCase()}" for ${getTrialLabel(trialId)}.`
        : result.error || 'Failed to update trial visibility.',
      details: []
    });
  };

  const onRemoveTrialVisibility = async (trialId: number) => {
    if (!requireAdminName(() => openAdminNameDialog(adminName, () => onRemoveTrialVisibility(trialId)))) return;
    const result = await handleRemoveTrialVisibility(trialId, getTrialLabel(trialId));
    setSuccessDialog({
      isOpen: true,
      title: result.success ? 'Trial Override Removed!' : 'Error',
      message: result.success
        ? `${getTrialLabel(trialId)} will now inherit the show default visibility setting.`
        : result.error || 'Failed to remove trial override.',
      details: []
    });
  };

  const onSetShowSelfCheckin = async (enabled: boolean) => {
    if (!requireAdminName(() => openAdminNameDialog(adminName, () => onSetShowSelfCheckin(enabled)))) return;
    const result = await handleSetShowSelfCheckin(enabled, licenseKey);
    setSuccessDialog({
      isOpen: true,
      title: result.success ? 'Show Self Check-In Updated!' : 'Error',
      message: result.success
        ? `Self check-in is now ${enabled ? 'ENABLED' : 'DISABLED'} by default for all trials/classes.`
        : result.error || 'Failed to update show self check-in.',
      details: []
    });
  };

  const onSetTrialSelfCheckin = async (trialId: number, enabled: boolean) => {
    if (!requireAdminName(() => openAdminNameDialog(adminName, () => onSetTrialSelfCheckin(trialId, enabled)))) return;
    const result = await handleSetTrialSelfCheckin(trialId, enabled, getTrialLabel(trialId));
    setSuccessDialog({
      isOpen: true,
      title: result.success ? 'Trial Self Check-In Updated!' : 'Error',
      message: result.success
        ? `${getTrialLabel(trialId)} self check-in is now ${enabled ? 'ENABLED' : 'DISABLED'}.`
        : result.error || 'Failed to update trial self check-in.',
      details: []
    });
  };

  const onRemoveTrialSelfCheckin = async (trialId: number) => {
    if (!requireAdminName(() => openAdminNameDialog(adminName, () => onRemoveTrialSelfCheckin(trialId)))) return;
    const result = await handleRemoveTrialSelfCheckin(trialId, getTrialLabel(trialId));
    setSuccessDialog({
      isOpen: true,
      title: result.success ? 'Trial Override Removed!' : 'Error',
      message: result.success
        ? `${getTrialLabel(trialId)} will now inherit the show default self check-in setting.`
        : result.error || 'Failed to remove trial override.',
      details: []
    });
  };

  const onBulkSetVisibility = async (preset: VisibilityPreset) => {
    if (!requireAdminName(() => openAdminNameDialog(adminName, () => onBulkSetVisibility(preset)))) return;
    const result = await handleBulkSetClassVisibility(preset, classes, adminName);
    if (!result.success && result.error?.includes('select at least one')) {
      setSuccessDialog({ isOpen: true, title: 'No Classes Selected', message: result.error, details: [] });
      return;
    }
    await refetch();
    setSuccessDialog({
      isOpen: true,
      title: result.success ? 'Class Visibility Updated!' : 'Error',
      message: result.success
        ? `Result visibility set to "${preset.toUpperCase()}" for ${result.affectedClasses?.length} class(es).`
        : result.error || 'Failed to update class visibility.',
      details: result.affectedClasses || []
    });
  };

  const onBulkEnableCheckin = async () => {
    if (!requireAdminName(() => openAdminNameDialog(adminName, () => onBulkEnableCheckin()))) return;
    const result = await handleBulkSetClassSelfCheckin(true, classes, adminName);
    if (!result.success && result.error?.includes('select at least one')) {
      setSuccessDialog({ isOpen: true, title: 'No Classes Selected', message: result.error, details: [] });
      return;
    }
    await refetch();
    setSuccessDialog({
      isOpen: true,
      title: result.success ? 'Class Self Check-In Updated!' : 'Error',
      message: result.success
        ? `Self check-in ENABLED for ${result.affectedClasses?.length} class(es).`
        : result.error || 'Failed to update class self check-in.',
      details: result.affectedClasses || []
    });
  };

  const onBulkDisableCheckin = async () => {
    if (!requireAdminName(() => openAdminNameDialog(adminName, () => onBulkDisableCheckin()))) return;
    const result = await handleBulkSetClassSelfCheckin(false, classes, adminName);
    if (!result.success && result.error?.includes('select at least one')) {
      setSuccessDialog({ isOpen: true, title: 'No Classes Selected', message: result.error, details: [] });
      return;
    }
    await refetch();
    setSuccessDialog({
      isOpen: true,
      title: result.success ? 'Class Self Check-In Updated!' : 'Error',
      message: result.success
        ? `Self check-in DISABLED for ${result.affectedClasses?.length} class(es).`
        : result.error || 'Failed to update class self check-in.',
      details: result.affectedClasses || []
    });
  };

  // Offline state
  if (isOffline) {
    return (
      <div className="results-control-tab results-control-tab--offline">
        <div className="offline-message">
          <span className="offline-icon">📡</span>
          <h3>Connection Required</h3>
          <p>Results control features require an internet connection. Please reconnect to manage classes and settings.</p>
        </div>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="results-control-tab results-control-tab--loading">
        <div className="loading-spinner"></div>
        <div>Loading competition classes...</div>
      </div>
    );
  }

  // Error state
  if (queryError) {
    return (
      <div className="results-control-tab results-control-tab--error">
        <div className="error-icon">⚠️</div>
        <div>Error: {(queryError as Error).message || 'Failed to load data'}</div>
        <button onClick={() => refetch()} className="retry-button">Retry</button>
      </div>
    );
  }

  // Read-only mode - show message
  if (isReadOnly) {
    return (
      <div className="results-control-tab results-control-tab--readonly">
        <div className="readonly-message">
          <span className="readonly-icon">🔒</span>
          <h3>Admin Access Required</h3>
          <p>Only administrators can modify results visibility and self check-in settings.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="results-control-tab">
      {/* Admin Name Input */}
      <div className="admin-controls">
        <div className="admin-input-group">
          <label htmlFor="adminName">
            <User className="input-icon" />
            Administrator Name:
          </label>
          <input
            id="adminName"
            type="text"
            value={adminName}
            onChange={(e) => setAdminName(e.target.value)}
            placeholder="Enter your name (optional - will prompt if needed)"
            className="admin-input"
          />
        </div>
      </div>

      <ResultVisibilitySection
        isExpanded={visibilitySectionExpanded}
        onToggleExpanded={() => setVisibilitySectionExpanded(!visibilitySectionExpanded)}
        showVisibilityPreset={showVisibilityPreset}
        trialVisibilitySettings={trialVisibilitySettings}
        trials={trials}
        onSetShowVisibility={onSetShowVisibility}
        onSetTrialVisibility={onSetTrialVisibility}
        onRemoveTrialVisibility={onRemoveTrialVisibility}
      />

      <SelfCheckinSection
        isExpanded={checkinSectionExpanded}
        onToggleExpanded={() => setCheckinSectionExpanded(!checkinSectionExpanded)}
        showSelfCheckinEnabled={showSelfCheckinEnabled}
        trialSelfCheckinSettings={trialSelfCheckinSettings}
        trials={trials}
        onSetShowSelfCheckin={onSetShowSelfCheckin}
        onSetTrialSelfCheckin={onSetTrialSelfCheckin}
        onRemoveTrialSelfCheckin={onRemoveTrialSelfCheckin}
      />

      <ClassesList
        classes={classes}
        selectedClasses={selectedClasses}
        onToggleClassSelection={toggleClassSelection}
        onSelectAllClasses={() => selectAllClasses(classes)}
        onClearSelection={clearSelection}
        onBulkSetVisibility={onBulkSetVisibility}
        onBulkEnableCheckin={onBulkEnableCheckin}
        onBulkDisableCheckin={onBulkDisableCheckin}
      />

      {/* Dialogs */}
      <ConfirmationDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        type={confirmDialog.type}
        confirmText="Confirm"
        onConfirm={() => handleConfirmAction(() => {})}
        onCancel={handleCancelAction}
        details={confirmDialog.details}
      />

      <SuccessDialog
        isOpen={successDialog.isOpen}
        title={successDialog.title}
        message={successDialog.message}
        onClose={closeSuccessDialog}
        details={successDialog.details}
      />

      <AdminNameDialog
        isOpen={adminNameDialog.isOpen}
        tempAdminName={tempAdminName}
        onAdminNameChange={setTempAdminName}
        onConfirm={() => handleAdminNameSubmit(tempAdminName, setAdminName)}
        onCancel={handleAdminNameCancel}
      />
    </div>
  );
};

export default ResultsControlTab;
