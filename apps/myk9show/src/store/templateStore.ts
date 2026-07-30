import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { getOptimalStorage } from '@/services/database/storage-adapter';
import { logger } from '@/services/LoggingService';
import { ClassTemplate } from '@/types/template.types';
import { AKC_SCENT_WORK_TEMPLATE } from '@/data/templates/akcScentWorkTemplate';
import { STRUCTURED_TEMPLATES } from '@/data/mockTemplatesWithFields';
import { runTemplateStorageCleanup } from '@/utils/cleanup-localstorage';
import { fetchAllSportTemplatesWithRules } from '@/services/sportTemplateService';
import { mapSportTemplateToClassTemplate } from '@/types/sport-template-types';
import { TemplateStore, initialState } from './templateStore.types';
import {
  filterTemplates,
  applyActiveFilters,
  migrateV0ToV1,
  upsertTemplates,
  shouldRevalidate,
} from './templateStore.helpers';

export type { TemplateStore } from './templateStore.types';

/**
 * How long a persisted template cache is considered fresh before a background
 * revalidation is due. `0` = revalidate on every load (the current default —
 * chosen because sport templates are low-churn setup data and a single embed
 * fetch is cheap). Raise this to trade freshness for fewer round-trips.
 */
const TEMPLATE_REVALIDATE_TTL_MS = 0;

// Dedupes concurrent revalidations (e.g. onRehydrate + a component mount racing)
// into a single in-flight DB fetch.
let _refreshInFlight: Promise<void> | null = null;

export const useTemplateStore = create<TemplateStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      // Queries
      getTemplate: id => get().templates.find(t => t.id === id),

      getTemplatesByOrganization: org =>
        get().templates.filter(t => t.organization === org && t.isActive),

      getTemplatesByTrialType: type =>
        get().templates.filter(t => t.trialType === type && t.isActive),

      getTemplatesByOrgAndType: (org, type) =>
        get().templates.filter(t => t.organization === org && t.trialType === type && t.isActive),

      ensureTemplatesLoaded: async () => {
        const { templates, isInitialized } = get();
        if (isInitialized && templates.length > 0) return;

        return new Promise<void>(resolve => {
          setTimeout(() => {
            try {
              get().loadTemplatesFromDB();
              resolve();
            } catch {
              resolve();
            }
          }, 0);
        });
      },

      getOfficialTemplates: () => get().templates.filter(t => t.isOfficial && t.isActive),

      getCustomTemplates: () => get().templates.filter(t => t.isCustom && t.isActive),

      searchTemplates: filter => filterTemplates(get().templates, filter),

      setSearchQuery: query => set({ searchQuery: query }),
      setFilterOrganization: org => set({ filterOrganization: org }),
      setFilterTrialType: type => set({ filterTrialType: type }),

      getFilteredTemplates: () => {
        const { templates, searchQuery, filterOrganization, filterTrialType } = get();
        return applyActiveFilters(templates, filterOrganization, filterTrialType, searchQuery);
      },

      clearFilters: () => set({ searchQuery: '', filterOrganization: null, filterTrialType: null }),

      // Active template management
      setActiveTemplate: id => {
        if (id === null) {
          set({ activeTemplate: null });
          return;
        }
        const template = get().templates.find(t => t.id === id);
        if (template) {
          set({ activeTemplate: template, error: null });
        } else {
          set({ error: `Template with id ${id} not found` });
        }
      },

      clearActiveTemplate: () => set({ activeTemplate: null }),

      // Utility
      clearError: () => set({ error: null }),
      resetStore: () => set(initialState),

      // Load templates from the DB (the only source — nothing is seeded locally)
      loadTemplatesFromDB: (force = false) => {
        const { templates, isInitialized } = get();

        if (!force && (isInitialized || templates.length > 0)) return;

        set({ isLoading: true });

        const loadFromDB = async () => {
          try {
            const rows = await fetchAllSportTemplatesWithRules();
            const dbTemplates = rows.map(row =>
              mapSportTemplateToClassTemplate(row, row.sport_class_rules)
            );

            if (dbTemplates.length > 0) {
              set(state => ({
                // Upsert (replace-by-id) so a re-init actually refreshes changed
                // templates instead of skipping them because the id already exists.
                templates: upsertTemplates(state.templates, dbTemplates),
                isInitialized: true,
                isLoading: false,
                templatesFetchedAt: Date.now(),
                error: null,
              }));
              return;
            }
          } catch (error) {
            logger.warn('DB template fetch failed, using local fallback', 'store', {
              error: error instanceof Error ? error.message : String(error),
            });
          }

          // Fallback: hardcoded AKC template + STRUCTURED_TEMPLATES
          try {
            const templatesToAdd: ClassTemplate[] = [];
            const currentTemplates = get().templates;

            if (force || !currentTemplates.some(t => t.id === 'akc-scent-work-official-2024')) {
              templatesToAdd.push({
                ...AKC_SCENT_WORK_TEMPLATE,
                id: 'akc-scent-work-official-2024',
                createdAt: new Date(),
                createdBy: 'system',
              });
            }

            STRUCTURED_TEMPLATES.forEach(template => {
              if (force || !currentTemplates.some(t => t.id === template.id)) {
                templatesToAdd.push({
                  ...template,
                  createdAt: template.createdAt || new Date(),
                  createdBy: template.createdBy || 'system',
                  updatedAt: new Date(),
                });
              }
            });

            set(state => {
              const existingIds = new Set(state.templates.map(t => t.id));
              const newTemplates = templatesToAdd.filter(t => !existingIds.has(t.id));
              return {
                templates: [...state.templates, ...newTemplates],
                isInitialized: true,
                isLoading: false,
                error: null,
              };
            });
          } catch (error) {
            logger.error('Error initializing templates:', 'store', {}, error as Error);
            set({
              isInitialized: true,
              isLoading: false,
              error: `Failed to initialize templates: ${error instanceof Error ? error.message : 'Unknown error'}`,
            });
          }
        };

        // Non-blocking: kick off the async load
        loadFromDB();
      },

      // Stale-while-revalidate: reach already-active clients that cached templates
      // before a DB change, without a manual cache clear. Keeps serving the
      // persisted cache on failure/offline (offline-first) and upserts fresh rows
      // by id so a stale snapshot (e.g. 16 ASCA classes) converges to the DB state
      // (32 classes incl. Level C).
      refreshTemplatesFromDB: async (options = {}) => {
        const { force = false } = options;

        if (
          !force &&
          !shouldRevalidate(get().templatesFetchedAt, TEMPLATE_REVALIDATE_TTL_MS, Date.now())
        ) {
          return;
        }

        // Coalesce concurrent callers onto a single in-flight fetch.
        if (_refreshInFlight) return _refreshInFlight;

        _refreshInFlight = (async () => {
          try {
            const rows = await fetchAllSportTemplatesWithRules();
            const dbTemplates = rows.map(row =>
              mapSportTemplateToClassTemplate(row, row.sport_class_rules)
            );

            if (dbTemplates.length > 0) {
              set(state => ({
                templates: upsertTemplates(state.templates, dbTemplates),
                isInitialized: true,
                templatesFetchedAt: Date.now(),
                error: null,
              }));
            }
          } catch (error) {
            // Offline-first: never wipe the cache on a failed revalidation.
            logger.warn('Template revalidation failed; keeping cached templates', 'store', {
              error: error instanceof Error ? error.message : String(error),
            });
          } finally {
            _refreshInFlight = null;
          }
        })();

        return _refreshInFlight;
      },
    }),
    {
      name: 'myk9show-template-storage',
      storage: createJSONStorage(() => getOptimalStorage('templates')),
      version: 1,
      partialize: state => ({
        templates: state.templates,
        isInitialized: state.isInitialized,
        templatesFetchedAt: state.templatesFetchedAt,
      }),
      migrate: (persistedState: unknown, version: number) => {
        if (version === 0) {
          return migrateV0ToV1(persistedState);
        }
        return persistedState;
      },
      onRehydrateStorage: () => {
        return (_state, error) => {
          // PERFORMANCE OPTIMIZATION: Skip automatic template *initialization* —
          // templates are still loaded on-demand when template features are accessed.
          //
          // REVALIDATE-ON-LOAD: but if a cache WAS hydrated, kick a background
          // refresh so clients that cached templates before a DB change converge
          // without a manual clear. Offline-first — only when online; the persisted
          // cache keeps serving otherwise. Deferred so hydration fully settles
          // before we upsert fresh DB rows on top of it.
          if (error) return;
          if (typeof window === 'undefined') return;
          if (navigator.onLine === false) return;
          setTimeout(() => {
            void useTemplateStore.getState().refreshTemplatesFromDB();
          }, 0);
        };
      },
    }
  )
);

// Clean up old localStorage data on startup
if (typeof window !== 'undefined') {
  runTemplateStorageCleanup();
}

// Templates load lazily via ensureTemplatesLoaded() when a consumer mounts.
// Do not eager-load here: it duplicated rows on every page load.
