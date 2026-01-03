import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { ensureReplicationManager } from '@/utils/replicationHelper';
import type { Class, Entry, Trial } from '@/services/replication';
import { logger } from '@/utils/logger';

export interface ClassInfo {
  id: string;
  trial_date: string;
  trial_number: number;
  element_type: string;
  level?: string;
  section?: string;
  class_name?: string;
  judge_name?: string;
  entry_total_count?: number;
  entry_completed_count?: number;
  class_status?: string;
  start_time?: string | null;
}

export interface EntryInfo {
  id: string;
  armband: string;
  dog_name: string;
  breed?: string;
  handler_name: string;
  status: 'pending' | 'in_ring' | 'completed';
  result_status?: string;
  section?: string;
  sort_order?: string;
  checkin_status?: number;
}

interface UseTVDataOptions {
  licenseKey: string;
  enablePolling?: boolean;
  pollingInterval?: number;
}

/** Raw class data from view_tv_classes_status Supabase view */
interface RawClassData {
  id: number;
  trial_date: string;
  trial_number: number;
  element: string;
  display_level: string;
  section?: string;
  class_name: string;
  judge_name?: string;
  class_status?: string;
  planned_start_time?: string | null;
}

/** Raw entry data from view_entry_class_join_normalized Supabase view */
interface RawEntryData {
  id: number;
  armband_number: number;
  dog_call_name: string;
  dog_breed?: string;
  handler_name: string;
  is_scored: boolean;
  is_in_ring: boolean;
  result_status?: string;
  section?: string;
  exhibitor_order?: number;
  trial_date: string;
  trial_number: number;
  element: string;
  level: string;
  entry_status: string | null;
}

interface UseTVDataReturn {
  inProgressClasses: ClassInfo[];
  entriesByClass: Record<string, EntryInfo[]>;
  isConnected: boolean;
  error: string | null;
}

export const useTVData = ({
  licenseKey,
  enablePolling = true,
  pollingInterval = 30000
}: UseTVDataOptions): UseTVDataReturn => {
  const [inProgressClasses, setInProgressClasses] = useState<ClassInfo[]>([]);
  const [entriesByClass, setEntriesByClass] = useState<Record<string, EntryInfo[]>>({});
  const [isConnected, setIsConnected] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!licenseKey) {
      setError('No license key provided');
      return;
    }

    const fetchData = async () => {
      try {
        // Priority mapping for sorting (used in both cache and Supabase paths)
        const priorityMap: Record<string, number> = {
          'in_progress': 1,
          'briefing': 2,
          'start_time': 3,
          'setup': 4
        };

        let transformedClasses: ClassInfo[] = [];
        let entries: RawEntryData[] = [];

        // Try to load from cache first (offline-first)
        // NOTE: Only attempt cache if user is authenticated (has auth in localStorage)
        // Public TV pages don't have auth, so skip cache to avoid repeated errors
        let usedCache = false;
        const hasAuth = (() => {
          try {
            const auth = JSON.parse(localStorage.getItem('myK9Q_auth') || '{}');
            return !!auth.showContext?.licenseKey;
          } catch {
            return false;
          }
        })();

        if (hasAuth) {
          try {
            const manager = await ensureReplicationManager();
          const classesTable = manager.getTable('classes');
          const entriesTable = manager.getTable('entries');
          const trialsTable = manager.getTable('trials');

          if (classesTable && entriesTable && trialsTable) {
            const allClasses = await classesTable.getAll() as Class[];
            const allEntries = await entriesTable.getAll() as Entry[];
            const allTrials = await trialsTable.getAll() as Trial[];

            // Filter classes by license_key and status
            const activeStatuses = ['in_progress', 'briefing', 'start_time', 'setup'];
            const filteredClasses = allClasses.filter(cls =>
              cls.license_key === licenseKey &&
              activeStatuses.includes(cls.class_status || '')
            );

            if (filteredClasses.length > 0) {
              logger.log('📺 Building TV data from cache:', filteredClasses.length, 'classes');

              // Build trial lookup maps
              const trialNumberMap = new Map<string, number>();
              const trialDateMap = new Map<string, string>();
              allTrials.forEach(t => {
                trialNumberMap.set(String(t.id), t.trial_number || 1);
                trialDateMap.set(String(t.id), t.trial_date);
              });

              // Transform classes from cache
              transformedClasses = filteredClasses
                .map((cls) => ({
                  id: String(cls.id),
                  trial_date: trialDateMap.get(String(cls.trial_id)) || '',
                  trial_number: trialNumberMap.get(String(cls.trial_id)) || 1,
                  element_type: cls.element,
                  level: cls.level,
                  section: cls.section,
                  class_name: `${cls.element} ${cls.level}`,
                  judge_name: cls.judge_name,
                  entry_total_count: 0,
                  entry_completed_count: 0,
                  class_status: cls.class_status,
                  start_time: cls.planned_start_time
                }))
                .sort((a, b) => {
                  const dateCompare = a.trial_date.localeCompare(b.trial_date);
                  if (dateCompare !== 0) return dateCompare;
                  if (a.trial_number !== b.trial_number) return a.trial_number - b.trial_number;
                  const priorityA = priorityMap[a.class_status || 'setup'] || 99;
                  const priorityB = priorityMap[b.class_status || 'setup'] || 99;
                  if (priorityA !== priorityB) return priorityA - priorityB;
                  if (a.start_time && b.start_time) return a.start_time.localeCompare(b.start_time);
                  return (a.element_type || '').localeCompare(b.element_type || '');
                });

              // Get entries for these classes
              const classIdSet = new Set(filteredClasses.map(c => String(c.id)));
              const filteredEntries = allEntries.filter(e =>
                e.license_key === licenseKey &&
                classIdSet.has(String(e.class_id))
              );

              // Map entries to RawEntryData format
              entries = filteredEntries.map(e => {
                const cls = filteredClasses.find(c => String(c.id) === String(e.class_id));
                return {
                  id: parseInt(String(e.id), 10),
                  armband_number: e.armband_number,
                  dog_call_name: e.dog_call_name,
                  dog_breed: e.dog_breed,
                  handler_name: e.handler_name,
                  is_scored: e.is_scored,
                  is_in_ring: e.is_in_ring || false,
                  result_status: e.result_status,
                  section: cls?.section,
                  exhibitor_order: e.exhibitor_order,
                  trial_date: trialDateMap.get(String(cls?.trial_id)) || '',
                  trial_number: trialNumberMap.get(String(cls?.trial_id)) || 1,
                  element: cls?.element || '',
                  level: cls?.level || '',
                  entry_status: e.entry_status || null
                };
              });

              usedCache = true;
              logger.log('✅ TV data loaded from cache:', transformedClasses.length, 'classes,', entries.length, 'entries');
            }
          }
          } catch (cacheError) {
            logger.error('❌ Error loading TV data from cache:', cacheError);
          }
        } // end if (hasAuth)

        // Fall back to Supabase if cache didn't work
        if (!usedCache) {
          logger.log('🔄 Fetching TV data from Supabase...');

          // Fetch classes using the combined view (handles Novice A & B combining at DB level)
          const { data: classes, error: classError } = await supabase
            .from('view_combined_classes')
            .select(`
              id,
              element,
              level,
              section,
              class_name,
              display_level,
              judge_name,
              class_status,
              trial_date,
              trial_number,
              planned_start_time,
              license_key
            `)
            .eq('license_key', licenseKey)
            .in('class_status', ['in_progress', 'briefing', 'start_time', 'setup'])
            .order('trial_date')
            .order('trial_number');

          if (classError) throw classError;

          // Transform classes from Supabase
          transformedClasses = (classes as RawClassData[] || [])
            .map((cls) => ({
              id: cls.id.toString(),
              trial_date: cls.trial_date,
              trial_number: cls.trial_number,
              element_type: cls.element,
              level: cls.display_level,
              section: cls.section,
              class_name: cls.class_name,
              judge_name: cls.judge_name,
              entry_total_count: 0,
              entry_completed_count: 0,
              class_status: cls.class_status,
              start_time: cls.planned_start_time
            }))
            .sort((a, b) => {
              const dateCompare = a.trial_date.localeCompare(b.trial_date);
              if (dateCompare !== 0) return dateCompare;
              if (a.trial_number !== b.trial_number) return a.trial_number - b.trial_number;
              const priorityA = priorityMap[a.class_status || 'setup'] || 99;
              const priorityB = priorityMap[b.class_status || 'setup'] || 99;
              if (priorityA !== priorityB) return priorityA - priorityB;
              if (a.start_time && b.start_time) return a.start_time.localeCompare(b.start_time);
              return (a.element_type || '').localeCompare(b.element_type || '');
            });

          // Fetch entries for all in-progress classes
          if (transformedClasses.length > 0) {
            const classIds = transformedClasses.map(c => parseInt(c.id));
            const batchSize = 10;

            for (let i = 0; i < classIds.length; i += batchSize) {
              const batchIds = classIds.slice(i, i + batchSize);

              const { data: batchEntries, error: entryError } = await supabase
                .from('view_entry_class_join_normalized')
                .select(`
                  id,
                  armband_number,
                  dog_call_name,
                  dog_breed,
                  handler_name,
                  is_scored,
                  is_in_ring,
                  result_status,
                  section,
                  exhibitor_order,
                  trial_date,
                  trial_number,
                  element,
                  level,
                  entry_status
                `)
                .eq('license_key', licenseKey)
                .in('class_id', batchIds)
                .order('exhibitor_order');

              if (entryError) throw entryError;

              if (batchEntries) {
                entries = [...entries, ...batchEntries];
              }
            }
          }
        }

        // Helper to map check-in status text to numeric codes
        const mapCheckinStatus = (statusText: string | null): number => {
          if (!statusText) return 0;
          const statusMap: Record<string, number> = {
            'none': 0,
            'checked-in': 1,
            'conflict': 2,
            'pulled': 3,
            'at-gate': 4
          };
          return statusMap[statusText.toLowerCase()] ?? 0;
        };

        // Group entries by class AND calculate counts
        const entriesByClassKey: Record<string, EntryInfo[]> = {};
        const countsPerClass = new Map<string, {total: number, completed: number}>();

        if (entries.length > 0) {
          entries.forEach((entry) => {
            const key = `${entry.trial_date}-${entry.trial_number}-${entry.element}-${entry.level}`;
            if (!entriesByClassKey[key]) {
              entriesByClassKey[key] = [];
              countsPerClass.set(key, {total: 0, completed: 0});
            }

            entriesByClassKey[key].push({
              id: entry.id.toString(),
              armband: entry.armband_number.toString(),
              dog_name: entry.dog_call_name,
              breed: entry.dog_breed || undefined,
              handler_name: entry.handler_name,
              status: entry.is_in_ring ? 'in_ring' :
                      entry.is_scored ? 'completed' : 'pending',
              result_status: entry.result_status || undefined,
              section: entry.section || undefined,
              sort_order: entry.exhibitor_order?.toString() || entry.armband_number.toString(),
              checkin_status: mapCheckinStatus(entry.entry_status)
            });

            // Calculate counts from actual entry data
            const counts = countsPerClass.get(key)!;
            counts.total += 1;
            if (entry.is_scored) {
              counts.completed += 1;
            }
          });
        }

        // Update class counts with calculated values
        transformedClasses.forEach(cls => {
          const key = `${cls.trial_date}-${cls.trial_number}-${cls.element_type}-${cls.level}`;
          const counts = countsPerClass.get(key) || {total: 0, completed: 0};
          cls.entry_total_count = counts.total;
          cls.entry_completed_count = counts.completed;
        });

        // No need to combine Novice A & B - the view already did that!
        setInProgressClasses(transformedClasses);
        setEntriesByClass(entriesByClassKey);

        setIsConnected(true);
        setError(null);
      } catch (err) {
        logger.error('Error fetching TV data:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
        setIsConnected(false);
      }
    };

    // Initial fetch
    fetchData();

    // Set up polling if enabled
    let interval: NodeJS.Timeout | undefined;
    if (enablePolling) {
      interval = setInterval(fetchData, pollingInterval);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [licenseKey, enablePolling, pollingInterval]);

  return {
    inProgressClasses,
    entriesByClass,
    isConnected,
    error
  };
};
