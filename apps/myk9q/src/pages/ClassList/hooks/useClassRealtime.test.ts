/**
 * Tests for useClassDialogs Hook
 */

import { renderHook, act } from '@testing-library/react';
import { vi } from 'vitest';
import { useClassDialogs } from './useClassDialogs';
import type { ClassEntry } from './useClassListData';

// Sample test data
const mockClassEntry: ClassEntry = {
  id: 1,
  trial_id: 1,
  element: 'Agility',
  level: 'Novice',
  section: 'A',
  class_name: 'Novice A Agility',
  class_order: 1,
  judge_name: 'Judge Smith',
  entry_count: 0,
  completed_count: 0,
  class_status: 'no-status',
  is_scoring_finalized: false,
  is_favorite: false,
  trial_date: '2025-01-20',
  trial_number: 1,
  dogs: [],
} as ClassEntry;

const mockClassEntry2: ClassEntry = {
  id: 2,
  trial_id: 1,
  element: 'Jumping',
  level: 'Open',
  section: 'B',
  class_name: 'Open B Jumping',
  class_order: 2,
  judge_name: 'Judge Jones',
  entry_count: 0,
  completed_count: 0,
  class_status: 'in_progress',
  is_scoring_finalized: false,
  is_favorite: false,
  trial_date: '2025-01-20',
  trial_number: 1,
  dogs: [],
} as ClassEntry;

describe('useClassDialogs', () => {
  beforeEach(() => {
    // No mocks needed - pure state management
  });

  describe('Initialization', () => {
    it('should initialize with all dialogs closed', () => {
      const { result } = renderHook(() => useClassDialogs());

      expect(result.current.statusDialogOpen).toBe(false);
      expect(result.current.requirementsDialogOpen).toBe(false);
      expect(result.current.maxTimeDialogOpen).toBe(false);
      expect(result.current.settingsDialogOpen).toBe(false);
      expect(result.current.activePopup).toBe(null);
    });

    it('should initialize with no selected classes', () => {
      const { result } = renderHook(() => useClassDialogs());

      expect(result.current.selectedClassForStatus).toBe(null);
      expect(result.current.selectedClassForRequirements).toBe(null);
      expect(result.current.selectedClassForMaxTime).toBe(null);
      expect(result.current.selectedClassForSettings).toBe(null);
    });

    it('should initialize with no popup position', () => {
      const { result } = renderHook(() => useClassDialogs());

      expect(result.current.popupPosition).toBe(null);
    });

    it('should provide all required methods', () => {
      const { result } = renderHook(() => useClassDialogs());

      expect(typeof result.current.setActivePopup).toBe('function');
      expect(typeof result.current.setPopupPosition).toBe('function');
      expect(typeof result.current.openRequirementsDialog).toBe('function');
      expect(typeof result.current.closeRequirementsDialog).toBe('function');
      expect(typeof result.current.openMaxTimeDialog).toBe('function');
      expect(typeof result.current.closeMaxTimeDialog).toBe('function');
      expect(typeof result.current.openSettingsDialog).toBe('function');
      expect(typeof result.current.closeSettingsDialog).toBe('function');
      expect(typeof result.current.closeAllDialogs).toBe('function');
      expect(typeof result.current.closePopup).toBe('function');
    });
  });

  describe('Popup menu management', () => {
    it('should set active popup', () => {
      const { result } = renderHook(() => useClassDialogs());

      act(() => {
        result.current.setActivePopup(1);
      });

      expect(result.current.activePopup).toBe(1);
    });

    it('should clear active popup', () => {
      const { result } = renderHook(() => useClassDialogs());

      act(() => {
        result.current.setActivePopup(1);
      });
      expect(result.current.activePopup).toBe(1);

      act(() => {
        result.current.setActivePopup(null);
      });
      expect(result.current.activePopup).toBe(null);
    });

    it('should set popup position', () => {
      const { result } = renderHook(() => useClassDialogs());
      const position = { top: 100, left: 50 };

      act(() => {
        result.current.setPopupPosition(position);
      });

      expect(result.current.popupPosition).toEqual(position);
    });

    it('should close popup with utility method', () => {
      const { result } = renderHook(() => useClassDialogs());

      act(() => {
        result.current.setActivePopup(1);
        result.current.setPopupPosition({ top: 100, left: 50 });
      });

      act(() => {
        result.current.closePopup();
      });

      expect(result.current.activePopup).toBe(null);
      expect(result.current.popupPosition).toBe(null);
    });
  });

  describe('Status dialog management', () => {
    it('should open status dialog', () => {
      const { result } = renderHook(() => useClassDialogs());

      act(() => {
        result.current.setStatusDialogOpen(true);
        result.current.setSelectedClassForStatus(mockClassEntry);
      });

      expect(result.current.statusDialogOpen).toBe(true);
      expect(result.current.selectedClassForStatus).toEqual(mockClassEntry);
    });

    it('should close status dialog', () => {
      const { result } = renderHook(() => useClassDialogs());

      act(() => {
        result.current.setStatusDialogOpen(true);
        result.current.setSelectedClassForStatus(mockClassEntry);
      });

      act(() => {
        result.current.setStatusDialogOpen(false);
        result.current.setSelectedClassForStatus(null);
      });

      expect(result.current.statusDialogOpen).toBe(false);
      expect(result.current.selectedClassForStatus).toBe(null);
    });
  });

  describe('Requirements dialog management', () => {
    it('should open requirements dialog', () => {
      const { result } = renderHook(() => useClassDialogs());

      act(() => {
        result.current.openRequirementsDialog(mockClassEntry);
      });

      expect(result.current.requirementsDialogOpen).toBe(true);
      expect(result.current.selectedClassForRequirements).toEqual(mockClassEntry);
    });

    it('should close requirements dialog', () => {
      const { result } = renderHook(() => useClassDialogs());

      act(() => {
        result.current.openRequirementsDialog(mockClassEntry);
      });

      act(() => {
        result.current.closeRequirementsDialog();
      });

      expect(result.current.requirementsDialogOpen).toBe(false);
      expect(result.current.selectedClassForRequirements).toBe(null);
    });

    it('should update selected class when opening again', () => {
      const { result } = renderHook(() => useClassDialogs());

      act(() => {
        result.current.openRequirementsDialog(mockClassEntry);
      });
      expect(result.current.selectedClassForRequirements).toEqual(mockClassEntry);

      act(() => {
        result.current.openRequirementsDialog(mockClassEntry2);
      });
      expect(result.current.selectedClassForRequirements).toEqual(mockClassEntry2);
    });
  });

  describe('Max time dialog management', () => {
    it('should open max time dialog', () => {
      const { result } = renderHook(() => useClassDialogs());

      act(() => {
        result.current.openMaxTimeDialog(mockClassEntry);
      });

      expect(result.current.maxTimeDialogOpen).toBe(true);
      expect(result.current.selectedClassForMaxTime).toEqual(mockClassEntry);
    });

    it('should close max time dialog', () => {
      const { result } = renderHook(() => useClassDialogs());

      act(() => {
        result.current.openMaxTimeDialog(mockClassEntry);
      });

      act(() => {
        result.current.closeMaxTimeDialog();
      });

      expect(result.current.maxTimeDialogOpen).toBe(false);
      expect(result.current.selectedClassForMaxTime).toBe(null);
    });

    it('should handle multiple opens with different classes', () => {
      const { result } = renderHook(() => useClassDialogs());

      act(() => {
        result.current.openMaxTimeDialog(mockClassEntry);
      });
      expect(result.current.selectedClassForMaxTime?.id).toBe(1);

      act(() => {
        result.current.openMaxTimeDialog(mockClassEntry2);
      });
      expect(result.current.selectedClassForMaxTime?.id).toBe(2);
    });
  });

  describe('Settings dialog management', () => {
    it('should open settings dialog', () => {
      const { result } = renderHook(() => useClassDialogs());

      act(() => {
        result.current.openSettingsDialog(mockClassEntry);
      });

      expect(result.current.settingsDialogOpen).toBe(true);
      expect(result.current.selectedClassForSettings).toEqual(mockClassEntry);
    });

    it('should close settings dialog', () => {
      const { result } = renderHook(() => useClassDialogs());

      act(() => {
        result.current.openSettingsDialog(mockClassEntry);
      });

      act(() => {
        result.current.closeSettingsDialog();
      });

      expect(result.current.settingsDialogOpen).toBe(false);
      expect(result.current.selectedClassForSettings).toBe(null);
    });
  });

  describe('Multiple dialogs interaction', () => {
    it('should allow multiple dialogs to be open simultaneously', () => {
      const { result } = renderHook(() => useClassDialogs());

      act(() => {
        result.current.openRequirementsDialog(mockClassEntry);
        result.current.openMaxTimeDialog(mockClassEntry);
        result.current.openSettingsDialog(mockClassEntry);
      });

      expect(result.current.requirementsDialogOpen).toBe(true);
      expect(result.current.maxTimeDialogOpen).toBe(true);
      expect(result.current.settingsDialogOpen).toBe(true);
    });

    it('should close all dialogs with utility method', () => {
      const { result } = renderHook(() => useClassDialogs());

      // Open everything
      act(() => {
        result.current.setStatusDialogOpen(true);
        result.current.setSelectedClassForStatus(mockClassEntry);
        result.current.openRequirementsDialog(mockClassEntry);
        result.current.openMaxTimeDialog(mockClassEntry);
        result.current.openSettingsDialog(mockClassEntry);
        result.current.setActivePopup(1);
        result.current.setPopupPosition({ top: 100, left: 50 });
      });

      // Close all at once
      act(() => {
        result.current.closeAllDialogs();
      });

      expect(result.current.statusDialogOpen).toBe(false);
      expect(result.current.selectedClassForStatus).toBe(null);
      expect(result.current.requirementsDialogOpen).toBe(false);
      expect(result.current.selectedClassForRequirements).toBe(null);
      expect(result.current.maxTimeDialogOpen).toBe(false);
      expect(result.current.selectedClassForMaxTime).toBe(null);
      expect(result.current.settingsDialogOpen).toBe(false);
      expect(result.current.selectedClassForSettings).toBe(null);
      expect(result.current.activePopup).toBe(null);
      expect(result.current.popupPosition).toBe(null);
    });

    it('should maintain independent state for each dialog', () => {
      const { result } = renderHook(() => useClassDialogs());

      act(() => {
        result.current.openRequirementsDialog(mockClassEntry);
        result.current.openMaxTimeDialog(mockClassEntry2);
      });

      expect(result.current.selectedClassForRequirements?.id).toBe(1);
      expect(result.current.selectedClassForMaxTime?.id).toBe(2);
    });
  });

  describe('Real-world scenarios', () => {
    it('should handle complete workflow for requirements', () => {
      const { result } = renderHook(() => useClassDialogs());

      // 1. User clicks requirements button
      act(() => {
        result.current.openRequirementsDialog(mockClassEntry);
      });
      expect(result.current.requirementsDialogOpen).toBe(true);

      // 2. User views requirements
      expect(result.current.selectedClassForRequirements).toEqual(mockClassEntry);

      // 3. User closes dialog
      act(() => {
        result.current.closeRequirementsDialog();
      });
      expect(result.current.requirementsDialogOpen).toBe(false);
    });

    it('should handle popup menu to dialog flow', () => {
      const { result } = renderHook(() => useClassDialogs());

      // 1. Open popup menu
      act(() => {
        result.current.setActivePopup(1);
        result.current.setPopupPosition({ top: 200, left: 75 });
      });

      // 2. User clicks settings in popup
      act(() => {
        result.current.openSettingsDialog(mockClassEntry);
        result.current.closePopup();
      });

      expect(result.current.settingsDialogOpen).toBe(true);
      expect(result.current.activePopup).toBe(null);
      expect(result.current.popupPosition).toBe(null);
    });

    it('should handle escape key closing all dialogs', () => {
      const { result } = renderHook(() => useClassDialogs());

      // Open multiple dialogs
      act(() => {
        result.current.openRequirementsDialog(mockClassEntry);
        result.current.openMaxTimeDialog(mockClassEntry);
        result.current.setActivePopup(1);
      });

      // Simulate escape key handler calling closeAllDialogs
      act(() => {
        result.current.closeAllDialogs();
      });

      expect(result.current.requirementsDialogOpen).toBe(false);
      expect(result.current.maxTimeDialogOpen).toBe(false);
      expect(result.current.activePopup).toBe(null);
    });

    it('should handle rapid dialog switching', () => {
      const { result } = renderHook(() => useClassDialogs());

      // Rapidly switch between dialogs
      act(() => {
        result.current.openRequirementsDialog(mockClassEntry);
      });
      act(() => {
        result.current.closeRequirementsDialog();
      });
      act(() => {
        result.current.openMaxTimeDialog(mockClassEntry2);
      });
      act(() => {
        result.current.closeMaxTimeDialog();
      });
      act(() => {
        result.current.openSettingsDialog(mockClassEntry);
      });

      // Final state should be only settings open
      expect(result.current.requirementsDialogOpen).toBe(false);
      expect(result.current.maxTimeDialogOpen).toBe(false);
      expect(result.current.settingsDialogOpen).toBe(true);
      expect(result.current.selectedClassForSettings).toEqual(mockClassEntry);
    });
  });
});
