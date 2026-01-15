import { useCallback } from 'react';
import { logger } from '@/services/LoggingService';

/**
 * Hook that wraps an onOpenChange handler to prevent dialog closes
 * when the user is interacting with slide-over panels.
 *
 * This is useful for dialogs that contain panel stacks, where clicking
 * inside a panel shouldn't close the parent dialog.
 *
 * @param onOpenChange - The original onOpenChange handler
 * @returns A wrapped handler that prevents closes during panel interactions
 */
export function usePreventPanelClose(
  onOpenChange: (open: boolean) => void
): (open: boolean) => void {
  return useCallback((newOpen: boolean) => {
    // If opening, always allow
    if (newOpen) {
      onOpenChange(newOpen);
      return;
    }

    // If closing, check if it's due to panel interaction
    const activeElement = document.activeElement;
    const clickedElement = document.elementFromPoint(
      window.innerWidth / 2,
      window.innerHeight / 2
    ) || activeElement;

    // Multiple detection methods for panel interactions
    const isPanelInteraction =
      // Check active element (focused element)
      activeElement?.closest('[data-panel-stack]') ||
      activeElement?.closest('.slide-over-panel') ||
      activeElement?.closest('[aria-labelledby="panel-title"]') ||
      // Check clicked element
      clickedElement?.closest('[data-panel-stack]') ||
      clickedElement?.closest('.slide-over-panel') ||
      clickedElement?.closest('[aria-labelledby="panel-title"]') ||
      // Check if any panel is currently visible
      document.querySelector('.slide-over-panel[style*="translate-x-0"]') ||
      document.querySelector('[data-panel-stack] [role="dialog"]:not(.wizard-dialog)') ||
      // Check for panel-specific elements
      (activeElement?.closest('form') && activeElement?.closest('[data-panel-stack]')) ||
      // Check input/textarea elements within panels
      ((activeElement?.tagName === 'INPUT' || activeElement?.tagName === 'TEXTAREA') &&
      (activeElement?.closest('.slide-over-panel') || activeElement?.closest('[data-panel-stack]')));

    if (isPanelInteraction) {
      // Prevent the dialog close - user is interacting with a panel
      logger.debug('usePreventPanelClose: Preventing close due to panel interaction', 'ui', { data: {
        activeElement: activeElement?.tagName,
        activeElementClasses: activeElement?.className,
        activeElementClosest: {
          panelStack: !!activeElement?.closest('[data-panel-stack]'),
          slideOver: !!activeElement?.closest('.slide-over-panel'),
          panelTitle: !!activeElement?.closest('[aria-labelledby="panel-title"]')
        }
      } });
      return;
    }

    // Allow legitimate close events
    onOpenChange(newOpen);
  }, [onOpenChange]);
}

export default usePreventPanelClose;
