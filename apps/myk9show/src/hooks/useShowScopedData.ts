import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useShowStore } from '@/store/showStore';
import { useEntryStore } from '@/store/entryStore';
import { useClassCreationStore } from '@/store/classCreationStore';
import { useLazyStore } from './useLazyStore';
import type { Show, ShowTrial } from '@/types/show-types';
import type { SyncableShowEntry } from '@/store/entryStore';
import type { CreatedClass } from '@/types/template.types';

/**
 * Options for scoping show data
 */
export interface ShowScopeOptions {
  /**
   * Explicit show ID to scope to (overrides URL and global selection)
   */
  showId?: string;
  
  /**
   * Whether to include entry data for this show
   */
  includeEntries?: boolean;
  
  /**
   * Whether to include class data for this show's trials
   */
  includeClasses?: boolean;
  
  /**
   * Whether to auto-load required stores if not already loaded
   */
  autoLoadStores?: boolean;
  
  /**
   * Fallback to global selection if no explicit showId provided
   */
  useGlobalSelection?: boolean;
}

/**
 * Scoped show data return type
 */
export interface ShowScopedData {
  // Core show data
  showId: string | null;
  show: Show | null;
  
  // Related data (only loaded if requested)
  entries: SyncableShowEntry[];
  classes: CreatedClass[];
  trials: ShowTrial[];
  
  // Loading states
  isLoading: boolean;
  isShowLoading: boolean;
  isEntriesLoading: boolean;
  isClassesLoading: boolean;
  
  // Error states
  error: string | null;
  
  // Utility functions
  hasData: boolean;
  isEmpty: boolean;
  
  // Actions
  selectShow: (id: string) => void;
  refreshData: () => void;
}

/**
 * Hook for loading and managing show-scoped data efficiently
 * 
 * This hook consolidates show data loading patterns and provides:
 * - Smart show selection (explicit > URL > global)
 * - Lazy loading of related stores
 * - Efficient filtering of related data
 * - Consistent loading states across components
 * 
 * @param options - Configuration for data scoping and loading
 */
export function useShowScopedData(options: ShowScopeOptions = {}): ShowScopedData {
  const {
    showId: explicitShowId,
    includeEntries = false,
    includeClasses = false,
    autoLoadStores = true,
    useGlobalSelection = true,
  } = options;

  // Get show ID from multiple sources (priority: explicit > URL > global)
  const params = useParams<{ id?: string; showId?: string }>();
  const urlShowId = params.id || params.showId;
  
  const { selectedShowId, selectShow } = useShowStore();
  
  const showId = explicitShowId || urlShowId || (useGlobalSelection ? selectedShowId : null);

  // Lazy load required stores only if auto-loading is enabled
  const showStoreState = useLazyStore(autoLoadStores ? 'showStore' : 'showStore');
  const entryStoreState = useLazyStore(autoLoadStores && includeEntries ? 'entryStore' : 'entryStore');
  const classStoreState = useLazyStore(autoLoadStores && includeClasses ? 'classCreationStore' : 'classCreationStore');

  // Get store methods and data
  const { getShowById, error: showError } = useShowStore();
  const { getEntriesByShow } = useEntryStore();
  const { getClassesByTrial } = useClassCreationStore();

  // Memoized show data
  const show = useMemo(() => {
    if (!showId) return null;
    return getShowById(showId) || null;
  }, [showId, getShowById]);

  // Memoized entries data (only compute if requested and show exists)
  const scopedEntries = useMemo(() => {
    if (!includeEntries || !showId || !show) return [];
    return getEntriesByShow(showId);
  }, [includeEntries, showId, show, getEntriesByShow]);

  // Memoized classes data (only compute if requested and show has trials)
  const scopedClasses = useMemo(() => {
    if (!includeClasses || !show?.trials?.length) return [];

    // Get classes for all trials in this show
    const allClasses: CreatedClass[] = [];
    for (const trial of show.trials) {
      const trialClasses = getClassesByTrial(trial.id);
      allClasses.push(...trialClasses);
    }
    return allClasses;
  }, [includeClasses, show, getClassesByTrial]);

  // Memoized trials data
  const trials = useMemo(() => {
    return show?.trials || [];
  }, [show]);

  // Loading states
  const isShowLoading = showStoreState.isLoading;
  const isEntriesLoading = includeEntries ? entryStoreState.isLoading : false;
  const isClassesLoading = includeClasses ? classStoreState.isLoading : false;
  const isLoading = isShowLoading || isEntriesLoading || isClassesLoading;

  // Error handling
  const error = showError || showStoreState.error || entryStoreState.error || classStoreState.error;

  // Utility flags
  const hasData = !!show;
  const isEmpty = !hasData && !isLoading;

  // Refresh function
  const refreshData = () => {
    // In a real implementation, this would trigger store refresh
    void showId;
  };

  return {
    // Core data
    showId,
    show,
    
    // Related data
    entries: scopedEntries,
    classes: scopedClasses,
    trials,
    
    // Loading states
    isLoading,
    isShowLoading,
    isEntriesLoading,
    isClassesLoading,
    
    // Error state
    error,
    
    // Utility flags
    hasData,
    isEmpty,
    
    // Actions
    selectShow,
    refreshData,
  };
}

/**
 * Optimized hook for components that need complete show data
 * Only loads entries and classes when they're actually needed
 */
export function useCompleteShowData(showId?: string, requirements?: {
  needsEntries?: boolean;
  needsClasses?: boolean;
}) {
  return useShowScopedData({
    showId,
    includeEntries: requirements?.needsEntries ?? false, // Default to false for performance
    includeClasses: requirements?.needsClasses ?? false, // Default to false for performance
    autoLoadStores: false, // Disable auto-loading for faster initial render
    useGlobalSelection: true,
  });
}

/**
 * Convenience hook for components that only need basic show info
 */
export function useBasicShowData(showId?: string) {
  return useShowScopedData({
    showId,
    includeEntries: false,
    includeClasses: false,
    autoLoadStores: true,
    useGlobalSelection: true,
  });
}

/**
 * Hook for components that need show data but shouldn't trigger global state changes
 */
export function useReadOnlyShowData(showId: string) {
  return useShowScopedData({
    showId,
    includeEntries: false,
    includeClasses: false,
    autoLoadStores: false,
    useGlobalSelection: false,
  });
}

export default useShowScopedData;