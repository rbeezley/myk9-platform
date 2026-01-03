// Core panel system exports
export * from './types';
export * from './SlideOverPanel';
export * from './PanelManager';
export * from './PanelContext';
export * from './context';
export * from './hooks';
export * from './PanelStack';
export * from './EntityCreationPanel';

// Make sure PanelProvider is explicitly available
export { PanelProvider } from './PanelContext';

// Entity-specific panels
export * from './entities/ClubCreationPanel';
export * from './entities/UserCreationPanel';
export * from './entities/JudgeCreationPanel';
export * from './entities/TemplateCreationPanel';

// Re-export the singleton panel manager instance
export { panelManager } from './PanelManager';