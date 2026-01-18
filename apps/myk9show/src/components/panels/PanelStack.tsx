import React from 'react';
import { SlideOverPanel } from './SlideOverPanel';
import { useActivePanels, usePanelOperations } from './hooks';
import { EntityCreationPanel } from './EntityCreationPanel';
import { Panel, EntityCreationResult } from './types';

export interface PanelStackProps {
  maxPanels?: number;
}

export const PanelStack: React.FC<PanelStackProps> = ({ maxPanels = 3 }) => {
  const activePanels = useActivePanels();

  // Only show the last few panels to avoid too many overlays
  const visiblePanels = activePanels.slice(-maxPanels);

  return (
    <>
      {visiblePanels.map((panel, index) => (
        <PanelRenderer 
          key={panel.id} 
          panel={panel} 
          zIndex={50 + index}
          isTopmost={index === visiblePanels.length - 1}
        />
      ))}
    </>
  );
};

interface PanelRendererProps {
  panel: Panel;
  zIndex: number;
  isTopmost: boolean;
}

const PanelRenderer: React.FC<PanelRendererProps> = ({ panel, zIndex, isTopmost }) => {
  const { closePanel, goBack, canGoBack } = usePanelOperations(panel.id);

  const handleClose = () => {
    closePanel({ success: false, action: 'cancel' });
  };

  const handleBack = () => {
    if (canGoBack()) {
      goBack();
    }
  };

  const handleResult = (result: EntityCreationResult) => {
    closePanel(result);
  };

  // Calculate panel offset for stacking effect
  const offsetX = Math.max(0, (panel.level - 1) * 20);
  const opacity = isTopmost ? 1 : 0.95;

  return (
    <div style={{ zIndex }}>
      <SlideOverPanel
        open={panel.isOpen}
        onClose={handleClose}
        title={panel.title}
        {...(panel.subtitle !== undefined && { subtitle: panel.subtitle })}
        size={panel.size}
        showBackButton={canGoBack()}
        onBack={handleBack}
        className="transition-all duration-300"
      >
        <div 
          style={{
            transform: `translateX(-${offsetX}px)`,
            opacity,
            transition: 'all 0.3s ease',
          }}
        >
          <EntityCreationPanel
            panelId={panel.id}
            context={panel.context}
            onResult={handleResult}
            onClose={handleClose}
          />
        </div>
      </SlideOverPanel>
    </div>
  );
};

export default PanelStack;