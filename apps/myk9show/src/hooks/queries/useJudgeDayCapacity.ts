import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { queryKeys } from '@/lib/queryClient';
import type { JudgeDayCapacity } from '@/types/waitlist-types';
import { calculateMailInReserved } from '@/utils/waitlistCapacity';

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

interface JudgeAssignmentCapacityRow {
  person_id: string;
  class_id: string | null;
  day_capacity_override: number | null;
  trials: {
    date: string;
  } | null;
}

interface ClassCapacityRow {
  id: string;
  name: string;
  max_entries: number | null;
}

interface ActiveEntryRow {
  class_id: string | null;
}

interface JudgeDayCapacityQueryData {
  judgeDays: JudgeDayCapacity[];
  fullClassIds: string[];
}

// These columns are added by migration 114; cast until types are regenerated.
interface ShowCapacityRow {
  default_judge_day_capacity: number;
  mail_in_strategy: string | null;
  mail_in_value: number | null;
  mail_in_deadline: string | null;
  mail_in_auto_release: boolean | null;
  mail_in_release_date: string | null;
}

export function useJudgeDayCapacity(showId: string | undefined) {
  const query = useQuery({
    queryKey: [queryKeys.show(showId!), 'judge-day-capacity'],
    queryFn: async (): Promise<JudgeDayCapacityQueryData> => {
      const [summaryResult, showResult, assignmentResult] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from('judge_day_summary').select('*').eq('show_id', showId!),
        supabase
          .from('shows')
          .select(
            'default_judge_day_capacity, mail_in_strategy, mail_in_value, mail_in_deadline, mail_in_auto_release, mail_in_release_date'
          )
          .eq('id', showId!)
          .single(),
        supabase
          .from('judge_assignments')
          .select('class_id, person_id, day_capacity_override, trials!inner(date)')
          .eq('show_id', showId!)
          .eq('status', 'confirmed'),
      ]);

      if (summaryResult.error) throw summaryResult.error;
      if (showResult.error) throw showResult.error;
      if (assignmentResult.error) throw assignmentResult.error;

      let data = (summaryResult.data as JudgeDaySummaryRow[]) ?? [];
      const show = showResult.data as unknown as ShowCapacityRow;
      const capacityOverrides = new Map<string, number>();
      for (const assignment of (assignmentResult.data as JudgeAssignmentCapacityRow[]) ?? []) {
        const date = assignment.trials?.date;
        if (!assignment.class_id || !date || assignment.day_capacity_override == null) continue;

        const key = `${assignment.person_id}:${date}`;
        capacityOverrides.set(
          key,
          Math.max(capacityOverrides.get(key) ?? 0, assignment.day_capacity_override)
        );
      }

      const { data: classData, error: classError } = await supabase
        .from('classes')
        .select('id, name, max_entries, trials!inner(show_id)')
        .eq('trials.show_id', showId!);
      if (classError) throw classError;

      const classRows = (classData as unknown as ClassCapacityRow[]) ?? [];
      const classIds = classRows.map(row => row.id);
      let fullClassIds: string[] = [];
      if (classIds.length > 0) {
        const { data: entryData, error: entryError } = await supabase
          .from('entries')
          .select('class_id')
          .in('class_id', classIds)
          .in('entry_status', [
            'submitted',
            'paid',
            'confirmed',
            'checked-in',
            'competing',
            'in-ring',
            'pending-payment',
          ])
          .is('deleted_at', null);
        if (entryError) throw entryError;

        const entryCounts = new Map<string, number>();
        for (const entry of (entryData as ActiveEntryRow[]) ?? []) {
          if (entry.class_id) {
            entryCounts.set(entry.class_id, (entryCounts.get(entry.class_id) ?? 0) + 1);
          }
        }

        // `judge_day_summary` is not visible to exhibitors in hosted Supabase,
        // even though the underlying assigned classes and entry rows are. An
        // empty view response must not mean "unlimited capacity": rebuild the
        // same judge-day groups from those exhibitor-readable rows. This keeps
        // cart checkout aligned with the registration wizard and fail-closed
        // when a judge-day is already full.
        if (data.length === 0) {
          const classById = new Map(classRows.map(row => [row.id, row]));
          const fallbackDays = new Map<string, JudgeDaySummaryRow>();

          for (const assignment of (assignmentResult.data as JudgeAssignmentCapacityRow[]) ?? []) {
            const date = assignment.trials?.date;
            const classId = assignment.class_id;
            if (!classId || !date) continue;

            const key = `${assignment.person_id}:${date}`;
            const existing = fallbackDays.get(key) ?? {
              show_id: showId!,
              judge_id: assignment.person_id,
              judge_name: 'Assigned judge',
              show_date: date,
              class_ids: [],
              class_names: [],
              confirmed_count: 0,
              waitlist_count: 0,
            };

            if (!existing.class_ids.includes(classId)) {
              existing.class_ids.push(classId);
              existing.class_names.push(classById.get(classId)?.name ?? 'Class');
              existing.confirmed_count += entryCounts.get(classId) ?? 0;
            }
            fallbackDays.set(key, existing);
          }

          data = Array.from(fallbackDays.values());
        }

        fullClassIds = classRows
          .filter(
            row =>
              row.max_entries != null &&
              row.max_entries > 0 &&
              (entryCounts.get(row.id) ?? 0) >= row.max_entries
          )
          .map(row => row.id);
      }

      const judgeDays = data.map(row => {
        const capacity =
          capacityOverrides.get(`${row.judge_id}:${row.show_date}`) ??
          show.default_judge_day_capacity ??
          125;
        const mailInReserved = calculateMailInReserved({
          capacity,
          strategy: show.mail_in_strategy,
          value: show.mail_in_value,
          autoRelease: show.mail_in_auto_release,
          releaseDate: show.mail_in_release_date,
        });

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

      return { judgeDays, fullClassIds };
    },
    enabled: !!showId,
  });

  return {
    judgeDays: query.data?.judgeDays ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    fullClassIds: query.data?.fullClassIds ?? [],
    error: query.error?.message ?? null,
    refetch: query.refetch,
  };
}
