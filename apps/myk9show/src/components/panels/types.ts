export type EntityType = 'club' | 'person' | 'judge' | 'template' | 'trial' | 'class';

export type PanelSize = 'sm' | 'md' | 'lg' | 'xl';

export interface ValidationRule {
  field: string;
  rule: 'required' | 'email' | 'phone' | 'url' | 'min' | 'max' | 'pattern';
  value?: string | number | RegExp;
  message: string;
}

export interface EntityCreationContext {
  entityType: EntityType;
  mode: 'create' | 'edit';
  preFilledData?: Record<string, unknown>;
  selectionCallback?: (entity: Record<string, unknown>) => void | Promise<void>;
  validationRules?: ValidationRule[];
  parentPanelId?: string;
  metadata?: Record<string, unknown>;
}

export interface EntityCreationResult {
  success: boolean;
  entity?: Record<string, unknown>;
  error?: string;
  action: 'save' | 'save_and_continue' | 'save_and_close' | 'cancel';
}

export interface Panel {
  id: string;
  type: EntityType;
  title: string;
  subtitle?: string;
  context: EntityCreationContext;
  isOpen: boolean;
  size: PanelSize;
  level: number; // For stacking (0 = base level)
  parentId?: string;
  children?: string[]; // Child panel IDs
}

export interface PanelStackState {
  panels: Record<string, Panel>;
  stack: string[]; // Panel IDs in order
  activePanel: string | null;
  maxLevel: number;
}

export interface PanelManager {
  // Panel operations
  openPanel: (config: {
    type: EntityType;
    title: string;
    subtitle?: string;
    context: EntityCreationContext;
    size?: PanelSize;
    parentId?: string;
  }) => string; // Returns panel ID
  closePanel: (panelId: string, result?: EntityCreationResult) => void;
  closeAllPanels: () => void;
  
  // Navigation
  goBack: (panelId: string) => void;
  canGoBack: (panelId: string) => boolean;
  
  // State
  getPanel: (panelId: string) => Panel | undefined;
  getActivePanels: () => Panel[];
  getCurrentPanel: () => Panel | null;
  getPanelStack: () => PanelStackState;
  
  // Events
  onPanelResult: (callback: (panelId: string, result: EntityCreationResult) => void) => void;
  onEntityCreated: (callback: (entity: Record<string, unknown>, context: EntityCreationContext) => void) => void;
  onStateChange: (callback: (state: PanelStackState) => void) => () => void;
  
  // Debug
  debug: () => void;
}

export interface PanelContextValue {
  manager: PanelManager;
  state: PanelStackState;
  isLoading: boolean;
  error: string | null;
}

// Panel component props
export interface BasePanelProps {
  panelId: string;
  context: EntityCreationContext;
  onResult: (result: EntityCreationResult) => void;
  onClose: () => void;
}

// Specific entity panel props
export interface ClubCreationPanelProps extends BasePanelProps {
  clubType?: 'specialty' | 'all-breed' | 'local' | 'regional' | 'national';
}

export interface PersonCreationPanelProps extends BasePanelProps {
  role?: 'chairman' | 'secretary' | 'judge' | 'exhibitor';
}

export interface JudgeCreationPanelProps extends BasePanelProps {
  requiredCertifications?: string[];
}

export interface TemplateCreationPanelProps extends BasePanelProps {
  templateType?: 'class' | 'show';
}