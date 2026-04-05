import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { queryKeys } from '@/lib/queryClient';
import type { JudgeDayCapacity } from '@/types/waitlist-types';

interface JudgeDaySummaryRow {
  show_id: string;
  judge_id: string;
  judge_name: string;
  show_date: string;
  class_ids: string[];
  class_names: string[];
  confirmed_count: number;
  waitlist_count: number;
}

// These columns are added by migration 114; cast until types are regenerated.
interface ShowCapacityRow {
  default_judge_day_capacity: number;
  mail_in_strategy: string | null;
  mail_in_value: number | null;
  mail_in_deadline: string | null;
}

export function useJudgeDayCapacity(showId: string | undefined) {
  const query = useQuery({
    queryKey: [queryKeys.show(showId!), 'judge-day-capacity'],
    queryFn: async (): Promise<JudgeDayCapacity[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('judge_day_summary')
        .select('*')
        .eq('show_id', showId!);

      if (error) throw error;

      const { data: showRaw, error: showError } = await supabase
        .from('shows')
        .select('default_judge_day_capacity, mail_in_strategy, mail_in_value, mail_in_deadline')
        .eq('id', showId!)
        .single();

      if (showError) throw showError;

      const show = showRaw as unknown as ShowCapacityRow;
      const capacity = show.default_judge_day_capacity ?? 125;

      return (data as JudgeDaySummaryRow[]).map(row => {
        let mailInReserved = 0;
        if (show.mail_in_strategy === 'fixed') {
          mailInReserved = show.mail_in_value ?? 0;
        } else if (show.mail_in_strategy === 'percentage') {
          mailInReserved = Math.floor((capacity * (show.mail_in_value ?? 0)) / 100);
        }

        return {
          judgeId: row.judge_id,
          judgeName: row.judge_name,
          showDate: row.show_date,
          capacity,
          confirmedCount: row.confirmed_count,
          waitlistCount: row.waitlist_count,
          mailInReserved,
          availableSpots: Math.max(0, capacity - row.confirmed_count - mailInReserved),
          classIds: row.class_ids,
          classNames: row.class_names,
        };
      });
    },
    enabled: !!showId,
  });

  return {
    judgeDays: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error?.message ?? null,
    refetch: query.refetch,
  };
}
