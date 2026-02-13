import { useState, useEffect } from 'react';
import { usePanelManager } from '@/components/panels/hooks';
import type { EntityCreationResult } from '@/components/panels/types';

/**
 * Tracks whether a panel is actively closing so that the wizard's
 * `onOpenChange(false)` event can be suppressed (prevents the wizard
 * from closing when the user cancels a nested panel).
 */
export function useWizardPanelListener(): boolean {
  const [isClosingPanel, setIsClosingPanel] = useState(false);
  const panelManager = usePanelManager();

  useEffect(() => {
    const handlePanelResult = (_panelId: string, result: EntityCreationResult) => {
      if (result.action === 'cancel') {
        setIsClosingPanel(true);

        // Reset flag after a short delay to allow any dialog close events to propagate
        setTimeout(() => {
          setIsClosingPanel(false);
        }, 50);
      }
    };

    panelManager.onPanelResult(handlePanelResult);

    return () => {
      setIsClosingPanel(false);
    };
  }, [panelManager]);

  return isClosingPanel;
}
