import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface ReportDogOption {
  id: string;
  callName: string;
  registeredName: string | null;
  armband: number | null;
}

export interface ReportDogOptions {
  dogs: ReportDogOption[];
  /**
   * The list could not be read, so an empty `dogs` means unknown, not none.
   *
   * `isError` alone is not enough: this query inherits networkMode:'online',
   * so offline it PAUSES -- isError false, data undefined -- and a bare
   * `?? []` would quietly report "this show has no dogs", which is the same
   * defect class the rest of this page exists to fix.
   */
  unavailable: boolean;
}

/**
 * Dogs entered in a show, for the Reports page's Dog filter.
 *
 * Only the four entry/transfer forms support a dog filter, so this is gated on
 * the selected report actually offering one.
 */
export function useReportDogOptions(
  showId: string | undefined,
  supportsDogFilter: boolean
): ReportDogOptions {
  const { data, isError, fetchStatus } = useQuery({
    queryKey: ['entry-form-dog-options', showId],
    queryFn: async (): Promise<ReportDogOption[]> => {
      if (!showId) return [];
      const { data: entryDogs } = await supabase
        .from('entries')
        .select('dog_id, armband, dog:dogs!inner(id, call_name)')
        .eq('show_id', showId)
        .is('deleted_at', null);

      if (!entryDogs?.length) return [];

      const dogIds = [...new Set(entryDogs.map(e => e.dog_id).filter(Boolean))] as string[];
      const { data: regs } = await supabase
        .from('dog_registrations')
        .select('dog_id, registered_name')
        .in('dog_id', dogIds);

      const regMap = new Map((regs ?? []).map(r => [r.dog_id, r.registered_name]));
      const seen = new Set<string>();

      return entryDogs
        .filter(e => {
          if (!e.dog_id || seen.has(e.dog_id)) return false;
          seen.add(e.dog_id);
          return true;
        })
        .map(e => ({
          id: e.dog_id!,
          callName: ((e.dog as Record<string, unknown>)?.call_name as string) ?? '',
          registeredName: regMap.get(e.dog_id!) ?? null,
          armband: e.armband != null ? Number(e.armband) : null,
        }))
        .sort((a, b) => (a.armband ?? 0) - (b.armband ?? 0));
    },
    enabled: !!showId && supportsDogFilter,
    staleTime: 5 * 60 * 1000,
  });

  return {
    dogs: data ?? [],
    unavailable: isError || (fetchStatus === 'paused' && data === undefined),
  };
}
