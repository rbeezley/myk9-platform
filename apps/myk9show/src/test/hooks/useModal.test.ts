import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useModal, useMultiModal, useConfirmationModal } from '@/hooks/ui/useModal';

describe('useModal', () => {
  describe('Basic modal functionality', () => {
    it('should initialize with default closed state', () => {
      const { result } = renderHook(() => useModal());
      
      expect(result.current.isOpen).toBe(false);
      expect(result.current.data).toBeNull();
    });

    it('should initialize with custom default state', () => {
      const { result } = renderHook(() => useModal(true));
      
      expect(result.current.isOpen).toBe(true);
      expect(result.current.data).toBeNull();
    });

    it('should open modal', () => {
      const { result } = renderHook(() => useModal());
      
      act(() => {
        result.current.open();
      });
      
      expect(result.current.isOpen).toBe(true);
    });

    it('should close modal and clear data', () => {
      const { result } = renderHook(() => useModal(true));
      
      // Set some data first
      act(() => {
        result.current.setData({ id: 123 });
      });
      
      expect(result.current.data).toEqual({ id: 123 });
      
      act(() => {
        result.current.close();
      });
      
      expect(result.current.isOpen).toBe(false);
      expect(result.current.data).toBeNull();
    });

    it('should toggle modal state', () => {
      const { result } = renderHook(() => useModal());
      
      // Toggle to open
      act(() => {
        result.current.toggle();
      });
      
      expect(result.current.isOpen).toBe(true);
      
      // Toggle to close
      act(() => {
        result.current.toggle();
      });
      
      expect(result.current.isOpen).toBe(false);
    });

    it('should clear data when toggling from open to closed', () => {
      const { result } = renderHook(() => useModal(true));
      
      act(() => {
        result.current.setData({ test: 'data' });
      });
      
      expect(result.current.data).toEqual({ test: 'data' });
      
      act(() => {
        result.current.toggle();
      });
      
      expect(result.current.isOpen).toBe(false);
      expect(result.current.data).toBeNull();
    });
  });

  describe('Data management', () => {
    it('should set data', () => {
      const { result } = renderHook(() => useModal());
      const testData = { id: 1, name: 'Test Item' };
      
      act(() => {
        result.current.setData(testData);
      });
      
      expect(result.current.data).toEqual(testData);
    });

    it('should open modal with data', () => {
      const { result } = renderHook(() => useModal());
      const testData = { id: 1, name: 'Test Item' };
      
      act(() => {
        result.current.openWithData(testData);
      });
      
      expect(result.current.isOpen).toBe(true);
      expect(result.current.data).toEqual(testData);
    });

    it('should handle various data types', () => {
      const { result } = renderHook(() => useModal());
      
      // String data
      act(() => {
        result.current.setData('string data');
      });
      expect(result.current.data).toBe('string data');
      
      // Number data
      act(() => {
        result.current.setData(42);
      });
      expect(result.current.data).toBe(42);
      
      // Array data
      act(() => {
        result.current.setData([1, 2, 3]);
      });
      expect(result.current.data).toEqual([1, 2, 3]);
      
      // Null data
      act(() => {
        result.current.setData(null);
      });
      expect(result.current.data).toBeNull();
    });
  });

  describe('Function stability', () => {
    it('should maintain function references between renders', () => {
      const { result, rerender } = renderHook(() => useModal());
      
      const initialFunctions = {
        open: result.current.open,
        close: result.current.close,
        toggle: result.current.toggle,
        setData: result.current.setData,
        openWithData: result.current.openWithData,
      };
      
      rerender();
      
      expect(result.current.open).toBe(initialFunctions.open);
      expect(result.current.close).toBe(initialFunctions.close);
      expect(result.current.toggle).toBe(initialFunctions.toggle);
      expect(result.current.setData).toBe(initialFunctions.setData);
      expect(result.current.openWithData).toBe(initialFunctions.openWithData);
    });
  });
});

describe('useMultiModal', () => {
  describe('Basic multi-modal functionality', () => {
    it('should initialize with empty modal state', () => {
      const { result } = renderHook(() => useMultiModal());
      
      expect(result.current.modals).toEqual({});
      expect(result.current.getModalState('nonexistent')).toEqual({
        isOpen: false,
        data: undefined
      });
    });

    it('should open individual modals', () => {
      const { result } = renderHook(() => useMultiModal());
      
      act(() => {
        result.current.openModal('edit', { id: 123 });
      });
      
      const editModalState = result.current.getModalState('edit');
      expect(editModalState.isOpen).toBe(true);
      expect(editModalState.data).toEqual({ id: 123 });
    });

    it('should close individual modals', () => {
      const { result } = renderHook(() => useMultiModal());
      
      // Open modal first
      act(() => {
        result.current.openModal('edit', { id: 123 });
      });
      
      // Close modal
      act(() => {
        result.current.closeModal('edit');
      });
      
      const editModalState = result.current.getModalState('edit');
      expect(editModalState.isOpen).toBe(false);
      expect(editModalState.data).toBeUndefined();
    });

    it('should toggle individual modals', () => {
      const { result } = renderHook(() => useMultiModal());
      
      // Toggle to open
      act(() => {
        result.current.toggleModal('delete', { id: 456 });
      });
      
      let deleteModalState = result.current.getModalState('delete');
      expect(deleteModalState.isOpen).toBe(true);
      expect(deleteModalState.data).toEqual({ id: 456 });
      
      // Toggle to close
      act(() => {
        result.current.toggleModal('delete');
      });
      
      deleteModalState = result.current.getModalState('delete');
      expect(deleteModalState.isOpen).toBe(false);
      expect(deleteModalState.data).toBeUndefined();
    });

    it('should manage multiple modals simultaneously', () => {
      const { result } = renderHook(() => useMultiModal());
      
      act(() => {
        result.current.openModal('edit', { id: 1 });
        result.current.openModal('delete', { id: 2 });
        result.current.openModal('view', { id: 3 });
      });
      
      expect(result.current.getModalState('edit').isOpen).toBe(true);
      expect(result.current.getModalState('delete').isOpen).toBe(true);
      expect(result.current.getModalState('view').isOpen).toBe(true);
      
      expect(result.current.getModalState('edit').data).toEqual({ id: 1 });
      expect(result.current.getModalState('delete').data).toEqual({ id: 2 });
      expect(result.current.getModalState('view').data).toEqual({ id: 3 });
    });

    it('should close all modals', () => {
      const { result } = renderHook(() => useMultiModal());
      
      // Open multiple modals
      act(() => {
        result.current.openModal('edit', { id: 1 });
        result.current.openModal('delete', { id: 2 });
      });
      
      // Close all modals
      act(() => {
        result.current.closeAllModals();
      });
      
      expect(result.current.modals).toEqual({});
      expect(result.current.getModalState('edit')).toEqual({
        isOpen: false,
        data: undefined
      });
      expect(result.current.getModalState('delete')).toEqual({
        isOpen: false,
        data: undefined
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle closing non-existent modals gracefully', () => {
      const { result } = renderHook(() => useMultiModal());
      
      act(() => {
        result.current.closeModal('nonexistent');
      });
      
      expect(result.current.getModalState('nonexistent')).toEqual({
        isOpen: false,
        data: undefined
      });
    });

    it('should handle toggling non-existent modals', () => {
      const { result } = renderHook(() => useMultiModal());
      
      act(() => {
        result.current.toggleModal('newModal', { test: true });
      });
      
      const modalState = result.current.getModalState('newModal');
      expect(modalState.isOpen).toBe(true);
      expect(modalState.data).toEqual({ test: true });
    });
  });

  describe('Function stability', () => {
    it('should maintain function references between renders', () => {
      const { result, rerender } = renderHook(() => useMultiModal());
      
      const initialFunctions = {
        openModal: result.current.openModal,
        closeModal: result.current.closeModal,
        toggleModal: result.current.toggleModal,
        getModalState: result.current.getModalState,
        closeAllModals: result.current.closeAllModals,
      };
      
      rerender();
      
      expect(result.current.openModal).toBe(initialFunctions.openModal);
      expect(result.current.closeModal).toBe(initialFunctions.closeModal);
      expect(result.current.toggleModal).toBe(initialFunctions.toggleModal);
      expect(result.current.getModalState).toBe(initialFunctions.getModalState);
      expect(result.current.closeAllModals).toBe(initialFunctions.closeAllModals);
    });
  });
});

describe('useConfirmationModal', () => {
  describe('Basic confirmation functionality', () => {
    it('should initialize with closed state and empty config', () => {
      const { result } = renderHook(() => useConfirmationModal());
      
      expect(result.current.isOpen).toBe(false);
      expect(result.current.config).toEqual({});
    });

    it('should show confirmation with config', () => {
      const { result } = renderHook(() => useConfirmationModal());
      const config = {
        title: 'Delete Item',
        message: 'Are you sure?',
        confirmText: 'Delete',
        cancelText: 'Cancel',
        variant: 'destructive' as const,
      };
      
      act(() => {
        result.current.showConfirmation(config);
      });
      
      expect(result.current.isOpen).toBe(true);
      expect(result.current.config).toEqual(config);
    });

    it('should handle confirm action', async () => {
      const { result } = renderHook(() => useConfirmationModal());
      const onConfirm = vi.fn().mockResolvedValue(undefined);
      
      act(() => {
        result.current.showConfirmation({
          title: 'Test',
          onConfirm,
        });
      });
      
      await act(async () => {
        await result.current.handleConfirm();
      });
      
      expect(onConfirm).toHaveBeenCalled();
      expect(result.current.isOpen).toBe(false);
      expect(result.current.config).toEqual({});
    });

    it('should handle cancel action', () => {
      const { result } = renderHook(() => useConfirmationModal());
      const onCancel = vi.fn();
      
      act(() => {
        result.current.showConfirmation({
          title: 'Test',
          onCancel,
        });
      });
      
      act(() => {
        result.current.handleCancel();
      });
      
      expect(onCancel).toHaveBeenCalled();
      expect(result.current.isOpen).toBe(false);
      expect(result.current.config).toEqual({});
    });

    it('should handle confirm without onConfirm callback', async () => {
      const { result } = renderHook(() => useConfirmationModal());
      
      act(() => {
        result.current.showConfirmation({
          title: 'Test',
        });
      });
      
      await act(async () => {
        await result.current.handleConfirm();
      });
      
      expect(result.current.isOpen).toBe(false);
      expect(result.current.config).toEqual({});
    });

    it('should handle cancel without onCancel callback', () => {
      const { result } = renderHook(() => useConfirmationModal());
      
      act(() => {
        result.current.showConfirmation({
          title: 'Test',
        });
      });
      
      act(() => {
        result.current.handleCancel();
      });
      
      expect(result.current.isOpen).toBe(false);
      expect(result.current.config).toEqual({});
    });
  });

  describe('Async confirmation handling', () => {
    it('should handle async onConfirm functions', async () => {
      const { result } = renderHook(() => useConfirmationModal());
      const onConfirm = vi.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 100))
      );
      
      act(() => {
        result.current.showConfirmation({
          title: 'Async Test',
          onConfirm,
        });
      });
      
      const confirmPromise = act(async () => {
        await result.current.handleConfirm();
      });
      
      await confirmPromise;
      
      expect(onConfirm).toHaveBeenCalled();
      expect(result.current.isOpen).toBe(false);
    });

    it('should handle errors in onConfirm functions', async () => {
      const { result } = renderHook(() => useConfirmationModal());
      const onConfirm = vi.fn().mockRejectedValue(new Error('Confirmation failed'));
      
      act(() => {
        result.current.showConfirmation({
          title: 'Error Test',
          onConfirm,
        });
      });
      
      await act(async () => {
        try {
          await result.current.handleConfirm();
        } catch {
          // Error is expected
        }
      });
      
      expect(onConfirm).toHaveBeenCalled();
      // Modal should still close even if onConfirm fails
      expect(result.current.isOpen).toBe(false);
    });
  });

  describe('Configuration variations', () => {
    it('should handle all configuration options', () => {
      const { result } = renderHook(() => useConfirmationModal());
      const fullConfig = {
        title: 'Full Configuration',
        message: 'This is a test message',
        confirmText: 'Yes, Do It',
        cancelText: 'No, Cancel',
        variant: 'destructive' as const,
        onConfirm: vi.fn(),
        onCancel: vi.fn(),
      };
      
      act(() => {
        result.current.showConfirmation(fullConfig);
      });
      
      expect(result.current.config).toEqual(fullConfig);
    });

    it('should handle minimal configuration', () => {
      const { result } = renderHook(() => useConfirmationModal());
      const minimalConfig = {
        title: 'Minimal',
      };
      
      act(() => {
        result.current.showConfirmation(minimalConfig);
      });
      
      expect(result.current.config).toEqual(minimalConfig);
    });

    it('should handle default variant', () => {
      const { result } = renderHook(() => useConfirmationModal());
      
      act(() => {
        result.current.showConfirmation({
          title: 'Default Variant',
          variant: 'default',
        });
      });
      
      expect(result.current.config.variant).toBe('default');
    });
  });

  describe('Function stability', () => {
    it('should maintain function references between renders', () => {
      const { result, rerender } = renderHook(() => useConfirmationModal());
      
      const initialFunctions = {
        showConfirmation: result.current.showConfirmation,
        handleConfirm: result.current.handleConfirm,
        handleCancel: result.current.handleCancel,
      };
      
      rerender();
      
      expect(result.current.showConfirmation).toBe(initialFunctions.showConfirmation);
      expect(result.current.handleConfirm).toBe(initialFunctions.handleConfirm);
      expect(result.current.handleCancel).toBe(initialFunctions.handleCancel);
    });
  });
});