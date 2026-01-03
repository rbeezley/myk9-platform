import React, { useEffect, useState } from 'react';
import { PanelContextValue, PanelStackState, EntityCreationResult, EntityCreationContext } from './types';
import { panelManager } from './PanelManager';
import { PanelContext } from './context';

export interface PanelProviderProps {
  children: React.ReactNode;
  onEntityCreated?: (entity: Record<string, unknown>, context: EntityCreationContext) => void;
  onPanelResult?: (panelId: string, result: EntityCreationResult) => void;
}

export const PanelProvider: React.FC<PanelProviderProps> = ({
  children,
  onEntityCreated,
  onPanelResult,
}) => {
  const [state, setState] = useState<PanelStackState>(panelManager.getPanelStack());
  const [isLoading] = useState(false);
  const [error] = useState<string | null>(null);

  // Subscribe to panel manager state changes
  useEffect(() => {
    const unsubscribe = panelManager.onStateChange((newState) => {
      setState(newState);
    });

    return unsubscribe;
  }, []);

  // Set up event listeners
  useEffect(() => {
    if (onEntityCreated) {
      panelManager.onEntityCreated(onEntityCreated);
    }

    if (onPanelResult) {
      panelManager.onPanelResult(onPanelResult);
    }
  }, [onEntityCreated, onPanelResult]);

  const contextValue: PanelContextValue = {
    manager: panelManager,
    state,
    isLoading,
    error,
  };

  return (
    <PanelContext.Provider value={contextValue}>
      {children}
    </PanelContext.Provider>
  );
};