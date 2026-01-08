/**
 * useStatsFilterOptions Hook
 *
 * Fetches and manages filter options for the Stats page.
 * Uses offline-first approach: tries cache first, falls back to Supabase.
 */

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { ensureReplicationManager } from '@/utils/replicationHelper';
import { getLevelSortOrder } from '@/lib/utils';
import { logger } from '@/utils/logger';
import type { Trial, Class } from '@/services/replication';

export interface FilterOptions {
  trialDates: string[];
  trialNumbers: number[];
  elements: string[];
  levels: string[];
  classes: Array<{ id: number; name: string; trialDate?: string; trialNumber?: number }>;
}

interface UseStatsFilterOptionsParams {
  licenseKey: string | undefined;
  showId: string | undefined;
  trialId?: string;
}

const EMPTY_OPTIONS: FilterOptions = {
  trialDates: [],
  trialNumbers: [],
  elements: [],
  levels: [],
  classes: []
};

/**
 * Fetches filter options for Stats page, using cache-first strategy.
 */
export function useStatsFilterOptions({
  licenseKey,
  showId,
  trialId
}: UseStatsFilterOptionsParams): FilterOptions {
  const [filterOptions, setFilterOptions] = useState<FilterOptions>(EMPTY_OPTIONS);

  useEffect(() => {
    const fetchFilterOptions = async () => {
      if (!licenseKey || !showId) return;

      // Try to build filter options from replicated cache first
      const cacheSuccess = await fetchFromCache(showId, trialId, setFilterOptions);
      if (cacheSuccess) return;

      // Fall back to Supabase queries
      await fetchFromSupabase(licenseKey, showId, trialId, setFilterOptions);
    };

    fetchFilterOptions();
  }, [licenseKey, showId, trialId]);

  return filterOptions;
}

/**
 * Fetch filter options from local cache
 */
async function fetchFromCache(
  showId: string,
  trialId: string | undefined,
  setFilterOptions: React.Dispatch<React.SetStateAction<FilterOptions>>
): Promise<boolean> {
  try {
    const manager = await ensureReplicationManager();
    const trialsTable = manager.getTable('trials');
    const classesTable = manager.getTable('classes');

    if (!trialsTable || !classesTable) return false;

    const allTrials = await trialsTable.getAll() as Trial[];
    const allClasses = await classesTable.getAll() as Class[];

    // Filter to current show
    const showTrials = allTrials.filter(t => String(t.show_id) === String(showId));
    const trialIds = new Set(showTrials.map(t => String(t.id)));
    const showClasses = allClasses.filter(c => trialIds.has(String(c.trial_id)));

    if (showTrials.length === 0 || showClasses.length === 0) return false;

    logger.log('📊 Building Stats filter options from cache');

    // Build trial number map
    const trialNumberMap = new Map<string, number>();
    const trialDateMap = new Map<string, string>();
    showTrials.forEach(t => {
      trialNumberMap.set(String(t.id), t.trial_number || 1);
      trialDateMap.set(String(t.id), t.trial_date);
    });

    // Extract unique values from classes
    const uniqueDates = [...new Set(
      showClasses.map(c => trialDateMap.get(String(c.trial_id))).filter(Boolean) as string[]
    )].sort();
    const uniqueElements = [...new Set(showClasses.map(c => c.element).filter(Boolean))].sort();
    const uniqueLevels = [...new Set(showClasses.map(c => c.level).filter(Boolean))]
      .sort((a, b) => getLevelSortOrder(a) - getLevelSortOrder(b));
    const uniqueTrialNumbers = [...new Set(
      showTrials.map(t => t.trial_number).filter(Boolean) as number[]
    )].sort((a, b) => a - b);

    // Build classes list (filtered by trialId if specified)
    let relevantClasses = showClasses;
    if (trialId) {
      relevantClasses = showClasses.filter(c => String(c.trial_id) === trialId);
    }

    const uniqueClasses = relevantClasses.map(c => ({
      id: parseInt(String(c.id), 10),
      name: `${c.element} - ${c.level}`,
      trialDate: trialDateMap.get(String(c.trial_id)) || '',
      trialNumber: trialNumberMap.get(String(c.trial_id))
    })).sort((a, b) => a.name.localeCompare(b.name));

    setFilterOptions({
      trialDates: uniqueDates,
      trialNumbers: uniqueTrialNumbers,
      elements: uniqueElements,
      levels: uniqueLevels,
      classes: uniqueClasses
    });

    logger.log('✅ Stats filter options loaded from cache');
    return true;
  } catch (error) {
    logger.error('❌ Error loading Stats filter options from cache:', error);
    return false;
  }
}

/**
 * Fetch filter options from Supabase
 */
async function fetchFromSupabase(
  licenseKey: string,
  showId: string,
  trialId: string | undefined,
  setFilterOptions: React.Dispatch<React.SetStateAction<FilterOptions>>
): Promise<void> {
  try {
    logger.log('🔄 Fetching Stats filter options from Supabase...');

    const { data: statsData } = await supabase
      .from('view_stats_summary')
      .select('trial_date, trial_id, element, level, class_id')
      .eq('license_key', licenseKey)
      .eq('show_id', showId);

    // Also fetch trials to get trial numbers
    const { data: trialsForNumber } = await supabase
      .from('trials')
      .select('id, trial_number')
      .eq('show_id', showId);

    if (statsData) {
      // Extract unique values
      const uniqueDates = [...new Set(statsData.map(d => d.trial_date).filter(Boolean))].sort();
      const uniqueElements = [...new Set(statsData.map(d => d.element).filter(Boolean))].sort();
      const uniqueLevels = [...new Set(statsData.map(d => d.level).filter(Boolean))]
        .sort((a, b) => getLevelSortOrder(a) - getLevelSortOrder(b));

      setFilterOptions(prev => ({
        ...prev,
        trialDates: uniqueDates,
        elements: uniqueElements,
        levels: uniqueLevels
      }));
    }

    // Fetch trial numbers from trials table
    const { data: trialsData } = await supabase
      .from('trials')
      .select('trial_number')
      .eq('show_id', showId)
      .order('trial_number');

    if (trialsData) {
      const uniqueTrialNumbers = [...new Set(
        trialsData.map(t => t.trial_number).filter(Boolean)
      )].sort((a, b) => a - b);
      setFilterOptions(prev => ({
        ...prev,
        trialNumbers: uniqueTrialNumbers
      }));
    }

    // Build classes list
    if (statsData) {
      let classesData = statsData;
      if (trialId) {
        const trialIdNum = parseInt(trialId);
        classesData = statsData.filter(d => d.trial_id === trialIdNum);
      }

      // Create a map of trial IDs to trial numbers
      const trialNumberMap = new Map<string, number>();
      if (trialsForNumber) {
        trialsForNumber.forEach(t => {
          trialNumberMap.set(String(t.id), t.trial_number);
        });
      }

      const uniqueClasses = [...new Set(classesData.map(d => JSON.stringify({
        id: d.class_id,
        name: `${d.element} - ${d.level}`,
        trialDate: d.trial_date,
        trialNumber: d.trial_id ? trialNumberMap.get(String(d.trial_id)) : undefined
      })).filter(Boolean))]
        .map(c => JSON.parse(c) as { id: number; name: string; trialDate: string; trialNumber?: number })
        .sort((a, b) => a.name.localeCompare(b.name));

      setFilterOptions(prev => ({
        ...prev,
        classes: uniqueClasses
      }));
    }
  } catch (err) {
    logger.error('Error fetching filter options from Supabase:', err);
  }
}
