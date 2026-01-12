/**
 * Fast Show Details Hook
 * 
 * Performance-optimized hook for show details page that eliminates
 * the 10-second loading delay by using cached data and smart loading strategies
 */

import { useMemo, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useShowQuery, showQueryKeys } from '@/hooks/queries/useShowsDatabase';
import type { Show } from '@/types/show-types';
import { logger } from '@/services/LoggingService';

interface FastShowDetailsResult {
  showId: string | null;
  show: Show | null;
  isLoading: boolean;
  isFromCache: boolean;
  loadTime: number;
  hasData: boolean;
}

export function useFastShowDetails(explicitShowId?: string): FastShowDetailsResult {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [loadStartTime] = useState(() => performance.now());
  const [loadTime, setLoadTime] = useState(0);
  const [isFromCache, setIsFromCache] = useState(false);
  
  const showId = explicitShowId || id || null;
  
  // Try to get cached data first (from browse shows page)
  const cachedShow = useMemo(() => {
    if (!showId) return null;
    
    // Check individual show cache first
    const individualCache = queryClient.getQueryData<Show>(showQueryKeys.detail(showId));
    if (individualCache) {
      setIsFromCache(true);
      return individualCache;
    }
    
    // Check shows list cache
    const showsList = queryClient.getQueryData<Show[]>(showQueryKeys.lists());
    if (showsList) {
      const foundShow = showsList.find(show => show.id === showId);
      if (foundShow) {
        setIsFromCache(true);
        // Also cache it for individual queries
        queryClient.setQueryData(showQueryKeys.detail(showId), foundShow);
        return foundShow;
      }
    }
    
    return null;
  }, [showId, queryClient]);
  
  // Only use network query if no cached data is available
  const { 
    data: networkShow, 
    isLoading: isNetworkLoading 
  } = useShowQuery(showId || '');
  
  // Use cached data if available, otherwise use network data
  const show = cachedShow || networkShow || null;
  const isLoading = !cachedShow && isNetworkLoading;
  
  // Track load time
  useEffect(() => {
    if (show && loadTime === 0) {
      const duration = performance.now() - loadStartTime;
      setLoadTime(duration);
      
      if (import.meta.env.DEV) {
        logger.debug(`⚡ Show details loaded in ${duration.toFixed(2)}ms${isFromCache ? ' (from cache)' : ' (from network)'}`, 'hooks', {});
      }
    }
  }, [show, loadTime, loadStartTime, isFromCache]);
  
  return {
    showId,
    show,
    isLoading,
    isFromCache,
    loadTime,
    hasData: !!show,
  };
}