import { ClassTemplate, TemplateFilter, Organization, TrialType } from '@/types/template.types';

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

/**
 * Read-only store over the sport-rule templates seeded in the database.
 *
 * There are deliberately NO mutation actions here. Sport rules are reference data
 * changed by migration, never from the client — see
 * docs/plan-template-authoring-removal.md. The former CRUD actions only ever wrote
 * to the persisted Zustand cache and were overwritten on the next load, because
 * TEMPLATE_REVALIDATE_TTL_MS is 0.
 */
export interface TemplateStoreActions {
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

  // Utility
  clearError: () => void;
  resetStore: () => void;

  /**
   * Load templates from the database. Despite the former name
   * (`initializeDefaultTemplates`) this never seeded anything locally — it is and
   * always was the DB fetch. `force` re-fetches even when already initialized.
   */
  loadTemplatesFromDB: (force?: boolean) => void;

  /**
   * Revalidate cached templates against the DB (stale-while-revalidate).
   * Keeps serving the persisted cache on failure/offline; upserts fresh rows by id
   * so stale clients converge. `force` bypasses the TTL check.
   */
  refreshTemplatesFromDB: (options?: { force?: boolean }) => Promise<void>;

  // Lazy loading method
  ensureTemplatesLoaded: () => Promise<void>;
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
