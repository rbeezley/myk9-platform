/**
 * useDialogState - Shared state management for dialog components
 *
 * Eliminates duplicated loading/saving/message state patterns across dialogs.
 * Provides a consistent API for managing dialog async operations and feedback.
 *
 * @example
 * ```tsx
 * const dialog = useDialogState();
 *
 * // In your save handler:
 * const handleSave = async () => {
 *   dialog.clearMessages();
 *   dialog.setSaving(true);
 *   try {
 *     await saveData();
 *     dialog.setSuccess('Saved successfully!');
 *   } catch (error) {
 *     dialog.setError('Failed to save');
 *   } finally {
 *     dialog.setSaving(false);
 *   }
 * };
 *
 * // In your JSX:
 * {dialog.successMessage && <SuccessMessage>{dialog.successMessage}</SuccessMessage>}
 * {dialog.errorMessage && <ErrorMessage>{dialog.errorMessage}</ErrorMessage>}
 * <button disabled={dialog.saving}>
 *   {dialog.saving ? 'Saving...' : 'Save'}
 * </button>
 * ```
 */

import { useState, useCallback } from 'react';

export interface DialogState {
  /** Whether initial data is being loaded */
  loading: boolean;
  /** Whether a save/submit operation is in progress */
  saving: boolean;
  /** Validation error message (e.g., form validation) */
  validationMessage: string;
  /** Success message after successful operation */
  successMessage: string;
  /** Error message after failed operation */
  errorMessage: string;

  // Setters
  setLoading: (loading: boolean) => void;
  setSaving: (saving: boolean) => void;
  setValidation: (message: string) => void;
  setSuccess: (message: string) => void;
  setError: (message: string) => void;

  // Helpers
  /** Clear all messages (validation, success, error) */
  clearMessages: () => void;
  /** Clear all state (messages + loading/saving) - useful when dialog closes */
  reset: () => void;
  /** Whether any operation is in progress */
  isProcessing: boolean;
  /** Whether any message is currently displayed */
  hasMessage: boolean;
}

export function useDialogState(): DialogState {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validationMessage, setValidationMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const clearMessages = useCallback(() => {
    setValidationMessage('');
    setSuccessMessage('');
    setErrorMessage('');
  }, []);

  const reset = useCallback(() => {
    setLoading(false);
    setSaving(false);
    setValidationMessage('');
    setSuccessMessage('');
    setErrorMessage('');
  }, []);

  // Helper setters that clear other message types
  const setValidation = useCallback((message: string) => {
    setSuccessMessage('');
    setErrorMessage('');
    setValidationMessage(message);
  }, []);

  const setSuccess = useCallback((message: string) => {
    setValidationMessage('');
    setErrorMessage('');
    setSuccessMessage(message);
  }, []);

  const setError = useCallback((message: string) => {
    setValidationMessage('');
    setSuccessMessage('');
    setErrorMessage(message);
  }, []);

  return {
    loading,
    saving,
    validationMessage,
    successMessage,
    errorMessage,

    setLoading,
    setSaving,
    setValidation,
    setSuccess,
    setError,

    clearMessages,
    reset,
    isProcessing: loading || saving,
    hasMessage: !!(validationMessage || successMessage || errorMessage),
  };
}
