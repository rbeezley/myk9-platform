import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDialogState } from './useDialogState';

describe('useDialogState', () => {
  describe('initial state', () => {
    it('should have all flags false and messages empty', () => {
      const { result } = renderHook(() => useDialogState());

      expect(result.current.loading).toBe(false);
      expect(result.current.saving).toBe(false);
      expect(result.current.validationMessage).toBe('');
      expect(result.current.successMessage).toBe('');
      expect(result.current.errorMessage).toBe('');
      expect(result.current.isProcessing).toBe(false);
      expect(result.current.hasMessage).toBe(false);
    });
  });

  describe('loading / saving', () => {
    it('should set loading state', () => {
      const { result } = renderHook(() => useDialogState());

      act(() => {
        result.current.setLoading(true);
      });

      expect(result.current.loading).toBe(true);
      expect(result.current.isProcessing).toBe(true);
    });

    it('should set saving state', () => {
      const { result } = renderHook(() => useDialogState());

      act(() => {
        result.current.setSaving(true);
      });

      expect(result.current.saving).toBe(true);
      expect(result.current.isProcessing).toBe(true);
    });

    it('should report isProcessing when either loading or saving', () => {
      const { result } = renderHook(() => useDialogState());

      act(() => {
        result.current.setLoading(true);
        result.current.setSaving(true);
      });

      expect(result.current.isProcessing).toBe(true);

      act(() => {
        result.current.setLoading(false);
      });

      // Still processing because saving is true
      expect(result.current.isProcessing).toBe(true);
    });
  });

  describe('message setters', () => {
    it('should set validation message and clear others', () => {
      const { result } = renderHook(() => useDialogState());

      act(() => {
        result.current.setSuccess('old success');
      });

      act(() => {
        result.current.setValidation('Field is required');
      });

      expect(result.current.validationMessage).toBe('Field is required');
      expect(result.current.successMessage).toBe('');
      expect(result.current.errorMessage).toBe('');
      expect(result.current.hasMessage).toBe(true);
    });

    it('should set success message and clear others', () => {
      const { result } = renderHook(() => useDialogState());

      act(() => {
        result.current.setError('old error');
      });

      act(() => {
        result.current.setSuccess('Saved!');
      });

      expect(result.current.successMessage).toBe('Saved!');
      expect(result.current.validationMessage).toBe('');
      expect(result.current.errorMessage).toBe('');
      expect(result.current.hasMessage).toBe(true);
    });

    it('should set error message and clear others', () => {
      const { result } = renderHook(() => useDialogState());

      act(() => {
        result.current.setSuccess('old success');
      });

      act(() => {
        result.current.setError('Failed!');
      });

      expect(result.current.errorMessage).toBe('Failed!');
      expect(result.current.validationMessage).toBe('');
      expect(result.current.successMessage).toBe('');
      expect(result.current.hasMessage).toBe(true);
    });
  });

  describe('clearMessages', () => {
    it('should clear all messages but keep loading/saving state', () => {
      const { result } = renderHook(() => useDialogState());

      act(() => {
        result.current.setSaving(true);
        result.current.setError('Some error');
      });

      act(() => {
        result.current.clearMessages();
      });

      expect(result.current.validationMessage).toBe('');
      expect(result.current.successMessage).toBe('');
      expect(result.current.errorMessage).toBe('');
      expect(result.current.saving).toBe(true);
      expect(result.current.hasMessage).toBe(false);
    });
  });

  describe('reset', () => {
    it('should reset all state', () => {
      const { result } = renderHook(() => useDialogState());

      act(() => {
        result.current.setLoading(true);
        result.current.setSaving(true);
        result.current.setError('Error!');
      });

      act(() => {
        result.current.reset();
      });

      expect(result.current.loading).toBe(false);
      expect(result.current.saving).toBe(false);
      expect(result.current.validationMessage).toBe('');
      expect(result.current.successMessage).toBe('');
      expect(result.current.errorMessage).toBe('');
      expect(result.current.isProcessing).toBe(false);
      expect(result.current.hasMessage).toBe(false);
    });
  });
});
