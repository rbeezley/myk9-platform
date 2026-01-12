import { logger } from '@/services/LoggingService';
import {
  EntityType, 
  Panel, 
  PanelStackState, 
  PanelManager, 
  EntityCreationContext, 
  EntityCreationResult,
  PanelSize 
} from './types';

export class PanelManagerImpl implements PanelManager {
  private state: PanelStackState = {
    panels: {},
    stack: [],
    activePanel: null,
    maxLevel: 0,
  };

  private listeners: {
    onPanelResult: Array<(panelId: string, result: EntityCreationResult) => void>;
    onEntityCreated: Array<(entity: Record<string, unknown>, context: EntityCreationContext) => void>;
    onStateChange: Array<(state: PanelStackState) => void>;
  } = {
    onPanelResult: [],
    onEntityCreated: [],
    onStateChange: [],
  };

  private generatePanelId(): string {
    return `panel-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private notifyStateChange(): void {
    this.listeners.onStateChange.forEach(callback => callback({ ...this.state }));
  }

  private updateState(updater: (state: PanelStackState) => void): void {
    updater(this.state);
    this.notifyStateChange();
  }

  openPanel(config: {
    type: EntityType;
    title: string;
    subtitle?: string;
    context: EntityCreationContext;
    size?: PanelSize;
    parentId?: string;
  }): string {
    const panelId = this.generatePanelId();
    const level = config.parentId 
      ? (this.state.panels[config.parentId]?.level ?? 0) + 1 
      : this.state.maxLevel + 1;

    const panel: Panel = {
      id: panelId,
      type: config.type,
      title: config.title,
      subtitle: config.subtitle,
      context: {
        ...config.context,
        parentPanelId: config.parentId,
      },
      isOpen: true,
      size: config.size || 'lg',
      level,
      parentId: config.parentId,
      children: [],
    };

    this.updateState(state => {
      // Add panel to state
      state.panels[panelId] = panel;
      
      // Update stack - add to end
      state.stack.push(panelId);
      
      // Update active panel
      state.activePanel = panelId;
      
      // Update max level
      state.maxLevel = Math.max(state.maxLevel, level);
      
      // Update parent's children if applicable
      if (config.parentId && state.panels[config.parentId]) {
        state.panels[config.parentId].children?.push(panelId);
      }
    });

    logger.debug('🎛️ Panel opened:', 'panels', { panelId, type: config.type, level });
    return panelId;
  }

  closePanel(panelId: string, result?: EntityCreationResult): void {
    const panel = this.state.panels[panelId];
    if (!panel) {
      logger.warn('Panel not found:', 'panels', { data: panelId });
      return;
    }

    // Close all child panels first
    if (panel.children && panel.children.length > 0) {
      [...panel.children].forEach(childId => {
        this.closePanel(childId);
      });
    }

    this.updateState(state => {
      // Remove from parent's children
      if (panel.parentId && state.panels[panel.parentId]) {
        const parent = state.panels[panel.parentId];
        if (parent.children) {
          parent.children = parent.children.filter(id => id !== panelId);
        }
      }

      // Remove from stack
      state.stack = state.stack.filter(id => id !== panelId);
      
      // Update active panel to the last one in stack
      state.activePanel = state.stack.length > 0 ? state.stack[state.stack.length - 1] : null;
      
      // Remove panel
      delete state.panels[panelId];
      
      // Recalculate max level
      state.maxLevel = Math.max(0, ...Object.values(state.panels).map(p => p.level));
    });

    // Notify listeners
    if (result) {
      this.listeners.onPanelResult.forEach(callback => callback(panelId, result));
      
      if (result.success && result.entity) {
        const context: EntityCreationContext = panel.context as EntityCreationContext;
        const entity: Record<string, unknown> = result.entity as Record<string, unknown>;
        this.listeners.onEntityCreated.forEach(callback => 
          callback(entity, context)
        );
      }
    }

    logger.debug('🎛️ Panel closed:', 'panels', { panelId, action: result?.action || 'no result' });
  }

  closeAllPanels(): void {
    // Close panels in reverse order (children first)
    const panelsToClose = [...this.state.stack].reverse();
    panelsToClose.forEach(panelId => this.closePanel(panelId));
    
    this.updateState(state => {
      state.panels = {};
      state.stack = [];
      state.activePanel = null;
      state.maxLevel = 0;
    });

    logger.debug('🎛️ All panels closed', 'components', {});
  }

  goBack(panelId: string): void {
    const panel = this.state.panels[panelId];
    if (!panel?.parentId) {
      logger.warn('Cannot go back - no parent panel:', 'panels', { data: panelId });
      return;
    }

    // Close current panel and activate parent
    this.closePanel(panelId);
  }

  canGoBack(panelId: string): boolean {
    const panel = this.state.panels[panelId];
    return !!(panel?.parentId && this.state.panels[panel.parentId]);
  }

  getPanel(panelId: string): Panel | undefined {
    return this.state.panels[panelId];
  }

  getActivePanels(): Panel[] {
    return this.state.stack
      .map(id => this.state.panels[id])
      .filter(Boolean)
      .sort((a, b) => a.level - b.level);
  }

  getCurrentPanel(): Panel | null {
    return this.state.activePanel ? this.state.panels[this.state.activePanel] : null;
  }

  getPanelStack(): PanelStackState {
    return { ...this.state };
  }

  onPanelResult(callback: (panelId: string, result: EntityCreationResult) => void): void {
    this.listeners.onPanelResult.push(callback);
  }

  onEntityCreated(callback: (entity: Record<string, unknown>, context: EntityCreationContext) => void): void {
    this.listeners.onEntityCreated.push(callback);
  }

  // Additional method for state change listeners (for React integration)
  onStateChange(callback: (state: PanelStackState) => void): () => void {
    this.listeners.onStateChange.push(callback);
    
    // Return cleanup function
    return () => {
      const index = this.listeners.onStateChange.indexOf(callback);
      if (index > -1) {
        this.listeners.onStateChange.splice(index, 1);
      }
    };
  }

  // Debug methods
  debug(): void {
    logger.debug('🎛️ Panel Manager State:', 'panels', { data: {
      panels: Object.keys(this.state.panels).length,
      stack: this.state.stack,
      activePanel: this.state.activePanel,
      maxLevel: this.state.maxLevel,
      panelDetails: Object.values(this.state.panels).map(p => ({
        id: p.id,
        type: p.type,
        title: p.title,
        level: p.level,
        parentId: p.parentId,
        children: p.children?.length || 0,
      })),
    } });
  }
}

// Singleton instance for global use
export const panelManager = new PanelManagerImpl();