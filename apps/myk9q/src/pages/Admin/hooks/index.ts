/**
 * Admin Hooks Index
 *
 * Centralized exports for all CompetitionAdmin hooks.
 */

export { useAdminName } from './useAdminName';
export type { UseAdminNameReturn } from './useAdminName';

export { useBulkOperations } from './useBulkOperations';
export type { UseBulkOperationsReturn, BulkOperationResult } from './useBulkOperations';

export { useCompetitionAdminData, useShowInfo, useClasses, useTrials, useBulkSelfCheckinMutation, competitionAdminKeys } from './useCompetitionAdminData';
export type { ClassInfo, TrialInfo, ShowInfo } from './useCompetitionAdminData';

export { useDialogs } from './useDialogs';
export type { UseDialogsReturn, ConfirmDialogState, SuccessDialogState, AdminNameDialogState, ConfirmDialogAction, ConfirmDialogType } from './useDialogs';

export { useSelfCheckinSettings } from './useSelfCheckinSettings';
export type { UseSelfCheckinSettingsReturn, Result } from './useSelfCheckinSettings';

export { useVisibilitySettings } from './useVisibilitySettings';
export type { UseVisibilitySettingsReturn } from './useVisibilitySettings';
