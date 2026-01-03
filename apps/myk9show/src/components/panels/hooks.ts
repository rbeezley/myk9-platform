import { useContext, useEffect, useState, useCallback } from 'react';
import { PanelContextValue, PanelStackState, PanelManager, EntityCreationResult } from './types';
import { PanelContext } from './context';

export const usePanelContext = (): PanelContextValue => {
  const context = useContext(PanelContext);
  if (context === undefined) {
    throw new Error('usePanelContext must be used within a PanelProvider');
  }
  return context;
};

// Convenience hooks for common operations
export const usePanelManager = (): PanelManager => {
  const { manager } = usePanelContext();
  return manager;
};

export const usePanelState = (): PanelStackState => {
  const { state } = usePanelContext();
  return state;
};

export const useActivePanels = () => {
  const { manager } = usePanelContext();
  const [panels, setPanels] = useState(manager.getActivePanels());

  useEffect(() => {
    const unsubscribe = manager.onStateChange(() => {
      setPanels(manager.getActivePanels());
    });

    return unsubscribe;
  }, [manager]);

  return panels;
};

export const useCurrentPanel = () => {
  const { manager } = usePanelContext();
  const [panel, setPanel] = useState(manager.getCurrentPanel());

  useEffect(() => {
    const unsubscribe = manager.onStateChange(() => {
      setPanel(manager.getCurrentPanel());
    });

    return unsubscribe;
  }, [manager]);

  return panel;
};

// Hook for panel-specific operations
export const usePanelOperations = (panelId?: string) => {
  const { manager } = usePanelContext();

  const closePanel = useCallback((result?: EntityCreationResult) => {
    if (panelId) {
      manager.closePanel(panelId, result);
    }
  }, [manager, panelId]);

  const goBack = useCallback(() => {
    if (panelId) {
      manager.goBack(panelId);
    }
  }, [manager, panelId]);

  const canGoBack = useCallback(() => {
    return panelId ? manager.canGoBack(panelId) : false;
  }, [manager, panelId]);

  const openChildPanel = useCallback((config: Parameters<PanelManager['openPanel']>[0]) => {
    return manager.openPanel({
      ...config,
      parentId: panelId,
    });
  }, [manager, panelId]);

  return {
    closePanel,
    goBack,
    canGoBack,
    openChildPanel,
  };
};