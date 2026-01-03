/**
 * Tests for useDialogs Hook
 */

import { renderHook, act } from '@testing-library/react';
import { vi } from 'vitest';
import { useDialogs } from './useDialogs';

describe('useDialogs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with all dialogs closed', () => {
      const { result } = renderHook(() => useDialogs());

      expect(result.current.confirmDialog.isOpen).toBe(false);
      expect(result.current.successDialog.isOpen).toBe(false);
      expect(result.current.adminNameDialog.isOpen).toBe(false);
    });

    it('should initialize confirm dialog with default values', () => {
      const { result } = renderHook(() => useDialogs());

      expect(result.current.confirmDialog).toEqual({
        isOpen: false,
        title: '',
        message: '',
        type: 'warning',
        action: null,
        details: []
      });
    });

    it('should initialize success dialog with default values', () => {
      const { result } = renderHook(() => useDialogs());

      expect(result.current.successDialog).toEqual({
        isOpen: false,
        title: '',
        message: '',
        details: []
      });
    });

    it('should initialize admin name dialog with default values', () => {
      const { result } = renderHook(() => useDialogs());

      expect(result.current.adminNameDialog).toEqual({
        isOpen: false,
        pendingAction: null
      });
      expect(result.current.tempAdminName).toBe('');
    });

    it('should provide all required methods', () => {
      const { result } = renderHook(() => useDialogs());

      expect(typeof result.current.setConfirmDialog).toBe('function');
      expect(typeof result.current.handleConfirmAction).toBe('function');
      expect(typeof result.current.handleCancelAction).toBe('function');
      expect(typeof result.current.setSuccessDialog).toBe('function');
      expect(typeof result.current.closeSuccessDialog).toBe('function');
      expect(typeof result.current.openAdminNameDialog).toBe('function');
      expect(typeof result.current.handleAdminNameSubmit).toBe('function');
      expect(typeof result.current.handleAdminNameCancel).toBe('function');
    });
  });

  describe('Confirmation Dialog', () => {
    it('should open confirmation dialog with correct data', () => {
      const { result } = renderHook(() => useDialogs());

      act(() => {
        result.current.setConfirmDialog({
          isOpen: true,
          title: 'Release Results',
          message: 'Are you sure?',
          type: 'warning',
          action: 'release',
          details: ['Class 1', 'Class 2']
        });
      });

      expect(result.current.confirmDialog.isOpen).toBe(true);
      expect(result.current.confirmDialog.title).toBe('Release Results');
      expect(result.current.confirmDialog.message).toBe('Are you sure?');
      expect(result.current.confirmDialog.type).toBe('warning');
      expect(result.current.confirmDialog.action).toBe('release');
      expect(result.current.confirmDialog.details).toEqual(['Class 1', 'Class 2']);
    });

    it('should close confirmation dialog and execute action on confirm', () => {
      const mockAction = vi.fn();
      const { result } = renderHook(() => useDialogs());

      act(() => {
        result.current.setConfirmDialog({
          isOpen: true,
          title: 'Confirm',
          message: 'Are you sure?',
          type: 'danger',
          action: 'release',
          details: []
        });
      });

      act(() => {
        result.current.handleConfirmAction(mockAction);
      });

      expect(result.current.confirmDialog.isOpen).toBe(false);
      expect(mockAction).toHaveBeenCalledTimes(1);
    });

    it('should close confirmation dialog without executing action on cancel', () => {
      const mockAction = vi.fn();
      const { result } = renderHook(() => useDialogs());

      act(() => {
        result.current.setConfirmDialog({
          isOpen: true,
          title: 'Confirm',
          message: 'Are you sure?',
          type: 'warning',
          action: 'release',
          details: []
        });
      });

      act(() => {
        result.current.handleCancelAction();
      });

      expect(result.current.confirmDialog.isOpen).toBe(false);
      expect(mockAction).not.toHaveBeenCalled();
    });

    it('should support different dialog types', () => {
      const { result } = renderHook(() => useDialogs());

      // Warning type
      act(() => {
        result.current.setConfirmDialog({
          isOpen: true,
          title: 'Warning',
          message: 'Test',
          type: 'warning',
          action: null,
          details: []
        });
      });
      expect(result.current.confirmDialog.type).toBe('warning');

      // Danger type
      act(() => {
        result.current.setConfirmDialog({
          isOpen: true,
          title: 'Danger',
          message: 'Test',
          type: 'danger',
          action: null,
          details: []
        });
      });
      expect(result.current.confirmDialog.type).toBe('danger');

      // Success type
      act(() => {
        result.current.setConfirmDialog({
          isOpen: true,
          title: 'Success',
          message: 'Test',
          type: 'success',
          action: null,
          details: []
        });
      });
      expect(result.current.confirmDialog.type).toBe('success');
    });

    it('should support different action types', () => {
      const { result } = renderHook(() => useDialogs());

      const actionTypes = ['release', 'enable_checkin', 'disable_checkin', null] as const;

      actionTypes.forEach(action => {
        act(() => {
          result.current.setConfirmDialog({
            isOpen: true,
            title: 'Test',
            message: 'Test',
            type: 'warning',
            action,
            details: []
          });
        });
        expect(result.current.confirmDialog.action).toBe(action);
      });
    });
  });

  describe('Success Dialog', () => {
    it('should open success dialog with correct data', () => {
      const { result } = renderHook(() => useDialogs());

      act(() => {
        result.current.setSuccessDialog({
          isOpen: true,
          title: 'Success!',
          message: 'Operation completed',
          details: ['Result 1', 'Result 2']
        });
      });

      expect(result.current.successDialog.isOpen).toBe(true);
      expect(result.current.successDialog.title).toBe('Success!');
      expect(result.current.successDialog.message).toBe('Operation completed');
      expect(result.current.successDialog.details).toEqual(['Result 1', 'Result 2']);
    });

    it('should close success dialog', () => {
      const { result } = renderHook(() => useDialogs());

      act(() => {
        result.current.setSuccessDialog({
          isOpen: true,
          title: 'Success',
          message: 'Test',
          details: []
        });
      });

      expect(result.current.successDialog.isOpen).toBe(true);

      act(() => {
        result.current.closeSuccessDialog();
      });

      expect(result.current.successDialog.isOpen).toBe(false);
    });

    it('should preserve dialog data when closing', () => {
      const { result } = renderHook(() => useDialogs());

      act(() => {
        result.current.setSuccessDialog({
          isOpen: true,
          title: 'Test Title',
          message: 'Test Message',
          details: ['Detail 1']
        });
      });

      act(() => {
        result.current.closeSuccessDialog();
      });

      expect(result.current.successDialog.isOpen).toBe(false);
      expect(result.current.successDialog.title).toBe('Test Title');
      expect(result.current.successDialog.message).toBe('Test Message');
      expect(result.current.successDialog.details).toEqual(['Detail 1']);
    });

    it('should handle empty details array', () => {
      const { result } = renderHook(() => useDialogs());

      act(() => {
        result.current.setSuccessDialog({
          isOpen: true,
          title: 'Success',
          message: 'No details',
          details: []
        });
      });

      expect(result.current.successDialog.details).toEqual([]);
    });
  });

  describe('Admin Name Dialog', () => {
    it('should open admin name dialog with pending action', () => {
      const mockAction = vi.fn();
      const { result } = renderHook(() => useDialogs());

      act(() => {
        result.current.openAdminNameDialog('John Doe', mockAction);
      });

      expect(result.current.adminNameDialog.isOpen).toBe(true);
      expect(result.current.adminNameDialog.pendingAction).toBe(mockAction);
      expect(result.current.tempAdminName).toBe('John Doe');
    });

    it('should pre-fill with existing admin name', () => {
      const { result } = renderHook(() => useDialogs());

      act(() => {
        result.current.openAdminNameDialog('Existing Name', vi.fn());
      });

      expect(result.current.tempAdminName).toBe('Existing Name');
    });

    it('should handle empty admin name', () => {
      const { result } = renderHook(() => useDialogs());

      act(() => {
        result.current.openAdminNameDialog('', vi.fn());
      });

      expect(result.current.tempAdminName).toBe('');
    });

    it('should execute pending action on submit', () => {
      const mockAction = vi.fn();
      const mockSetAdminName = vi.fn();
      const { result } = renderHook(() => useDialogs());

      act(() => {
        result.current.openAdminNameDialog('Old Name', mockAction);
      });

      act(() => {
        result.current.handleAdminNameSubmit('New Name', mockSetAdminName);
      });

      expect(mockSetAdminName).toHaveBeenCalledWith('New Name');
      expect(result.current.adminNameDialog.isOpen).toBe(false);
      expect(result.current.adminNameDialog.pendingAction).toBe(null);
      expect(mockAction).toHaveBeenCalledTimes(1);
    });

    it('should trim admin name on submit', () => {
      const mockSetAdminName = vi.fn();
      const { result } = renderHook(() => useDialogs());

      act(() => {
        result.current.openAdminNameDialog('', vi.fn());
      });

      act(() => {
        result.current.handleAdminNameSubmit('  John Doe  ', mockSetAdminName);
      });

      expect(mockSetAdminName).toHaveBeenCalledWith('John Doe');
    });

    it('should not execute action if none is pending', () => {
      const mockSetAdminName = vi.fn();
      const { result } = renderHook(() => useDialogs());

      // Open dialog without pending action
      act(() => {
        result.current.setAdminNameDialog({
          isOpen: true,
          pendingAction: null
        });
      });

      act(() => {
        result.current.handleAdminNameSubmit('Name', mockSetAdminName);
      });

      expect(mockSetAdminName).toHaveBeenCalledWith('Name');
      expect(result.current.adminNameDialog.isOpen).toBe(false);
      // No action should be called since pendingAction was null
    });

    it('should cancel admin name dialog without executing action', () => {
      const mockAction = vi.fn();
      const { result } = renderHook(() => useDialogs());

      act(() => {
        result.current.openAdminNameDialog('Name', mockAction);
      });

      act(() => {
        result.current.handleAdminNameCancel();
      });

      expect(result.current.adminNameDialog.isOpen).toBe(false);
      expect(result.current.adminNameDialog.pendingAction).toBe(null);
      expect(mockAction).not.toHaveBeenCalled();
    });
  });

  describe('Multiple dialogs interaction', () => {
    it('should allow multiple dialogs to be open simultaneously', () => {
      const { result } = renderHook(() => useDialogs());

      act(() => {
        result.current.setConfirmDialog({
          isOpen: true,
          title: 'Confirm',
          message: 'Test',
          type: 'warning',
          action: 'release',
          details: []
        });
        result.current.setSuccessDialog({
          isOpen: true,
          title: 'Success',
          message: 'Test',
          details: []
        });
        result.current.openAdminNameDialog('Name', vi.fn());
      });

      expect(result.current.confirmDialog.isOpen).toBe(true);
      expect(result.current.successDialog.isOpen).toBe(true);
      expect(result.current.adminNameDialog.isOpen).toBe(true);
    });

    it('should maintain independent state for each dialog', () => {
      const { result } = renderHook(() => useDialogs());

      act(() => {
        result.current.setConfirmDialog({
          isOpen: true,
          title: 'Confirm Title',
          message: 'Confirm Message',
          type: 'warning',
          action: 'release',
          details: ['Confirm Detail']
        });
        result.current.setSuccessDialog({
          isOpen: true,
          title: 'Success Title',
          message: 'Success Message',
          details: ['Success Detail']
        });
      });

      expect(result.current.confirmDialog.title).toBe('Confirm Title');
      expect(result.current.successDialog.title).toBe('Success Title');
    });
  });

  describe('Real-world scenarios', () => {
    it('should handle complete release results workflow', () => {
      const mockReleaseResults = vi.fn();
      const { result } = renderHook(() => useDialogs());

      // 1. Show confirmation dialog
      act(() => {
        result.current.setConfirmDialog({
          isOpen: true,
          title: 'Release Results',
          message: 'Are you sure you want to release results for 5 classes?',
          type: 'warning',
          action: 'release',
          details: ['Novice A', 'Novice B', 'Open A', 'Open B', 'Excellent']
        });
      });

      expect(result.current.confirmDialog.isOpen).toBe(true);

      // 2. User confirms
      act(() => {
        result.current.handleConfirmAction(mockReleaseResults);
      });

      expect(result.current.confirmDialog.isOpen).toBe(false);
      expect(mockReleaseResults).toHaveBeenCalled();

      // 3. Show success dialog
      act(() => {
        result.current.setSuccessDialog({
          isOpen: true,
          title: 'Results Released Successfully!',
          message: '5 classes have been made visible to all users.',
          details: ['Novice A', 'Novice B', 'Open A', 'Open B', 'Excellent']
        });
      });

      expect(result.current.successDialog.isOpen).toBe(true);

      // 4. User closes success dialog
      act(() => {
        result.current.closeSuccessDialog();
      });

      expect(result.current.successDialog.isOpen).toBe(false);
    });

    it('should handle admin name requirement workflow', () => {
      const mockReleaseResults = vi.fn();
      const mockSetAdminName = vi.fn();
      const { result } = renderHook(() => useDialogs());

      // 1. User tries to release results without admin name
      act(() => {
        result.current.openAdminNameDialog('', mockReleaseResults);
      });

      expect(result.current.adminNameDialog.isOpen).toBe(true);

      // 2. User enters admin name and submits
      act(() => {
        result.current.handleAdminNameSubmit('John Smith', mockSetAdminName);
      });

      expect(mockSetAdminName).toHaveBeenCalledWith('John Smith');
      expect(result.current.adminNameDialog.isOpen).toBe(false);
      expect(mockReleaseResults).toHaveBeenCalled();
    });

    it('should handle user canceling admin name dialog', () => {
      const mockReleaseResults = vi.fn();
      const { result } = renderHook(() => useDialogs());

      // 1. Open admin name dialog
      act(() => {
        result.current.openAdminNameDialog('', mockReleaseResults);
      });

      // 2. User cancels
      act(() => {
        result.current.handleAdminNameCancel();
      });

      expect(result.current.adminNameDialog.isOpen).toBe(false);
      expect(mockReleaseResults).not.toHaveBeenCalled();
    });

    it('should handle error scenarios', () => {
      const { result } = renderHook(() => useDialogs());

      // Show error in success dialog
      act(() => {
        result.current.setSuccessDialog({
          isOpen: true,
          title: 'Error',
          message: 'Failed to release results',
          details: ['Database connection failed']
        });
      });

      expect(result.current.successDialog.isOpen).toBe(true);
      expect(result.current.successDialog.title).toBe('Error');
    });

    it('should handle rapid dialog switching', () => {
      const { result } = renderHook(() => useDialogs());

      // Rapidly open and close different dialogs
      act(() => {
        result.current.setConfirmDialog({
          isOpen: true,
          title: 'Confirm',
          message: 'Test',
          type: 'warning',
          action: 'release',
          details: []
        });
      });
      act(() => {
        result.current.handleCancelAction();
      });
      act(() => {
        result.current.setSuccessDialog({
          isOpen: true,
          title: 'Success',
          message: 'Test',
          details: []
        });
      });
      act(() => {
        result.current.closeSuccessDialog();
      });
      act(() => {
        result.current.openAdminNameDialog('Name', vi.fn());
      });

      expect(result.current.confirmDialog.isOpen).toBe(false);
      expect(result.current.successDialog.isOpen).toBe(false);
      expect(result.current.adminNameDialog.isOpen).toBe(true);
    });
  });
});
