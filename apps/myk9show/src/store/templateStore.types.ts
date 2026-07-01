import {
  ClassTemplate,
  TemplateFilter,
  Organization,
  TrialType,
  TemplateImportExport,
} from '@/types/template.types';

export interface TemplateStoreState {
  templates: ClassTemplate[];
  activeTemplate: ClassTemplate | null;
  isLoading: boolean;
  error: string | null;
  searchQuery: string;
  filterOrganization: Organization | null;
  filterTrialType: TrialType | null;
  isInitialized: boolean;
  /**
   * Epoch ms of the last successful DB template fetch, or null if never fetched.
   * Persisted so an already-active client can decide whether its cached templates
   * are stale relative to a DB change (see `shouldRevalidate` / `refreshTemplatesFromDB`).
   */
  templatesFetchedAt: number | null;
}

export interface TemplateStoreActions {
  // CRUD Operations
  createTemplate: (
    template: Omit<ClassTemplate, 'id' | 'createdAt' | 'createdBy'>,
    userId: string
  ) => ClassTemplate;
  updateTemplate: (id: string, updates: Partial<ClassTemplate>, userId: string) => boolean;
  deleteTemplate: (id: string) => boolean;
  duplicateTemplate: (id: string, newName: string, userId: string) => ClassTemplate | null;

  // Advanced template operations
  createEditableCopy: (id: string, userId: string, newName?: string) => ClassTemplate | null;
  promoteToOfficial: (id: string, userId: string) => boolean;
  deprecateTemplate: (id: string, userId: string, successorId?: string) => boolean;
  createNewVersion: (id: string, versionNumber: string, userId: string) => ClassTemplate | null;
  canEdit: (template: ClassTemplate) => { canEdit: boolean; reason?: string };

  // Queries
  getTemplate: (id: string) => ClassTemplate | undefined;
  getTemplatesByOrganization: (org: Organization) => ClassTemplate[];
  getTemplatesByTrialType: (type: TrialType) => ClassTemplate[];
  getTemplatesByOrgAndType: (org: Organization, type: TrialType) => ClassTemplate[];
  getOfficialTemplates: () => ClassTemplate[];
  getCustomTemplates: () => ClassTemplate[];
  searchTemplates: (filter: TemplateFilter) => ClassTemplate[];
  setSearchQuery: (query: string) => void;
  setFilterOrganization: (org: Organization | null) => void;
  setFilterTrialType: (type: TrialType | null) => void;
  getFilteredTemplates: () => ClassTemplate[];
  clearFilters: () => void;

  // Active template management
  setActiveTemplate: (id: string | null) => void;
  clearActiveTemplate: () => void;

  // Import/Export
  exportTemplate: (id: string, userId: string) => TemplateImportExport | null;
  importTemplate: (data: TemplateImportExport, userId: string) => ClassTemplate | null;

  // Utility
  clearError: () => void;
  resetStore: () => void;

  // Initialize with default templates
  initializeDefaultTemplates: (force?: boolean) => void;

  /**
   * Revalidate cached templates against the DB (stale-while-revalidate).
   * Keeps serving the persisted cache on failure/offline; upserts fresh rows by id
   * so stale clients converge. `force` bypasses the TTL check.
   */
  refreshTemplatesFromDB: (options?: { force?: boolean }) => Promise<void>;

  // Lazy loading method
  ensureTemplatesLoaded: () => Promise<void>;

  // Emergency function to clear corrupted data
  clearCorruptedData: () => Promise<void>;
}

export type TemplateStore = TemplateStoreState & TemplateStoreActions;

export const initialState: TemplateStoreState = {
  templates: [],
  activeTemplate: null,
  isLoading: false,
  error: null,
  searchQuery: '',
  filterOrganization: null,
  filterTrialType: null,
  isInitialized: false,
  templatesFetchedAt: null,
};
