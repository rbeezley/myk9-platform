import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { OfflineFallback } from '@/components/ui';
import { logger } from '@/utils/logger';

interface DiagnosticResult {
  armbandNumber: string;
  dogCallName: string;
  totalEntries: number;
  scoredEntries: number;
  uniqueElementsScored: number;
  uniqueElementsQualified: number;
  hasNonQualified: boolean;
  allStatuses: string[];
  elementsList: string[];
  exclusionReason: string;
}

/** Entry data from view_stats_summary */
interface StatsEntry {
  armband_number: string;
  dog_call_name: string;
  element: string;
  result_status: string;
  is_scored: boolean;
}

/** Aggregated dog data during processing */
interface DogAggregate {
  armbandNumber: string;
  dogCallName: string;
  entries: StatsEntry[];
  elements: Set<string>;
  qualifiedElements: Set<string>;
  statuses: Set<string>;
}

interface Props {
  licenseKey: string;
  showId: string;
}

/**
 * Temporary diagnostic component to debug clean sweep issues
 * Shows why dogs are NOT appearing in clean sweep
 */
export function CleanSweepDiagnostic({ licenseKey, showId }: Props) {
  const [results, setResults] = useState<DiagnosticResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  // Track online/offline status for graceful degradation
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const fetchDiagnostics = async () => {
      try {
        const { data, error } = await supabase.rpc('diagnose_clean_sweep', {
          p_license_key: licenseKey,
          p_show_id: showId
        });

        if (error) {
          logger.error('Diagnostic query failed, using view_stats_summary:', error);

          // Fallback: aggregate in JavaScript
          const { data: statsData } = await supabase
            .from('view_stats_summary')
            .select('*')
            .eq('license_key', licenseKey)
            .eq('show_id', showId);

          if (statsData) {
            const dogMap = new Map<string, DogAggregate>();

            (statsData as StatsEntry[]).forEach((entry) => {
              const key = entry.armband_number;
              if (!dogMap.has(key)) {
                dogMap.set(key, {
                  armbandNumber: entry.armband_number,
                  dogCallName: entry.dog_call_name,
                  entries: [],
                  elements: new Set(),
                  qualifiedElements: new Set(),
                  statuses: new Set()
                });
              }

              const dog = dogMap.get(key)!;
              dog.entries.push(entry);
              dog.elements.add(entry.element);
              if (entry.result_status === 'qualified') {
                dog.qualifiedElements.add(entry.element);
              }
              dog.statuses.add(entry.result_status);
            });

            const diagnostics = Array.from(dogMap.values()).map((dog: DogAggregate) => {
              const hasNonQualified = Array.from(dog.statuses).some((s) =>
                ['nq', 'excused', 'absent', 'withdrawn'].includes(s)
              );

              let reason = 'Should be clean sweep';
              if (dog.entries.some((e) => !e.is_scored)) {
                reason = 'Not all entries scored';
              } else if (dog.elements.size !== dog.qualifiedElements.size) {
                reason = `Not all elements qualified (${dog.qualifiedElements.size}/${dog.elements.size})`;
              } else if (hasNonQualified) {
                reason = 'Has NQ/excused/absent/withdrawn';
              }

              return {
                armbandNumber: dog.armbandNumber,
                dogCallName: dog.dogCallName,
                totalEntries: dog.entries.length,
                scoredEntries: dog.entries.filter((e) => e.is_scored).length,
                uniqueElementsScored: dog.elements.size,
                uniqueElementsQualified: dog.qualifiedElements.size,
                hasNonQualified,
                allStatuses: Array.from(dog.statuses) as string[],
                elementsList: Array.from(dog.elements) as string[],
                exclusionReason: reason
              };
            });

            setResults(diagnostics);
          }
        } else {
          setResults(data || []);
        }
      } catch (err) {
        logger.error('Failed to fetch diagnostics:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchDiagnostics();
  }, [licenseKey, showId]);

  // Offline state - show graceful degradation message
  if (isOffline) {
    return (
      <OfflineFallback
        message="Clean sweep diagnostics require an internet connection."
      />
    );
  }

  if (loading) return <div>Loading diagnostics...</div>;

  const cleanSweepDogs = results.filter(r => r.exclusionReason === 'Should be clean sweep');
  const excludedDogs = results.filter(r => r.exclusionReason !== 'Should be clean sweep');

  return (
    <div style={{ padding: '1rem', backgroundColor: 'var(--card)', borderRadius: '8px', marginTop: '1rem' }}>
      <h3 style={{ marginBottom: '1rem', color: 'var(--foreground)' }}>
        🔍 Clean Sweep Diagnostic
      </h3>

      {cleanSweepDogs.length > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          <h4 style={{ color: 'green' }}>✅ Clean Sweep Dogs ({cleanSweepDogs.length})</h4>
          {cleanSweepDogs.map(dog => (
            <div key={dog.armbandNumber} style={{ padding: '0.5rem', backgroundColor: 'var(--muted)', marginBottom: '0.5rem', borderRadius: '4px' }}>
              <strong>{dog.armbandNumber} - {dog.dogCallName}</strong>
              <div>Elements: {dog.elementsList.join(', ')}</div>
              <div>Statuses: {dog.allStatuses.join(', ')}</div>
            </div>
          ))}
        </div>
      )}

      <h4 style={{ color: 'orange' }}>⚠️ Excluded Dogs ({excludedDogs.length})</h4>
      {excludedDogs.slice(0, 10).map(dog => (
        <div key={dog.armbandNumber} style={{
          padding: '0.5rem',
          backgroundColor: 'var(--muted)',
          marginBottom: '0.5rem',
          borderRadius: '4px',
          fontSize: '0.875rem'
        }}>
          <div><strong>{dog.armbandNumber} - {dog.dogCallName}</strong></div>
          <div>Reason: <span style={{ color: 'orange' }}>{dog.exclusionReason}</span></div>
          <div>Entries: {dog.scoredEntries}/{dog.totalEntries} scored</div>
          <div>Elements: {dog.uniqueElementsQualified}/{dog.uniqueElementsScored} qualified ({dog.elementsList.join(', ')})</div>
          <div>Statuses: {dog.allStatuses.join(', ')}</div>
        </div>
      ))}
    </div>
  );
}
