import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { useAuthContext } from '@/hooks/useAuthContext';
import type { ExhibitorClassInfo } from '@/types/exhibitor-types';
import { isCheckInStatus } from '@myk9/core';

// Raw shape returned by the Supabase query — typed manually because
// ring_number was added via a migration after codegen was last run.
interface CheckInDataRow {
  id: string;
  check_in_status: string | null;
  armband: string | null;
  run_order: number | null;
  handler_id: string;
  dog: {
    id: string;
    call_name: string | null;
    breed: string;
    sex: string | null;
    date_of_birth: string | null;
  };
  class: {
    id: string;
    name: string;
    element: string | null;
    level: string | null;
    max_entries: number | null;
    ring_number: number | null;
    start_time: string | null;
    judge_name: string | null;
    trial: {
      id: string;
      name: string;
      date: string;
      planned_start_time: string | null;
      show: {
        id: string;
        name: string;
        location: string | null;
      };
    };
  };
}

export function mapRowToClassInfo(row: CheckInDataRow): ExhibitorClassInfo {
  const cls = row.class;
  const trial = cls.trial;
  const show = trial.show;

  return {
    class: {
      id: cls.id,
      showId: show.id,
      trialId: trial.id,
      name: cls.name,
      element: cls.element ?? '',
      level: cls.level ?? '',
      maxEntries: cls.max_entries ?? 0,
      judgeName: cls.judge_name ?? '',
      startTime: cls.start_time ?? new Date().toISOString(),
      ringNumber: cls.ring_number ?? 0,
    },
    trial: {
      id: trial.id,
      showId: show.id,
      name: trial.name,
      date: trial.date,
      startTime: trial.planned_start_time ?? '',
      endTime: '',
      location: show.location ?? '',
      organization: '',
    },
    entry: {
      id: row.id,
      classId: cls.id,
      dogId: row.dog.id,
      handlerId: row.handler_id,
      armband: row.armband ?? '',
      ...(row.run_order != null ? { runningOrder: row.run_order } : {}),
      checkInStatus: row.check_in_status != null && isCheckInStatus(row.check_in_status)
        ? row.check_in_status
        : 'no-status',
      dogCallName: row.dog.call_name ?? '',
      dogRegistrationNumber: '',
      breed: row.dog.breed,
      handlerName: '',
      className: cls.name,
      ringNumber: cls.ring_number ?? 0,
      judgeName: cls.judge_name ?? '',
      dog: {
        id: row.dog.id,
        name: row.dog.call_name ?? '',
        breed: row.dog.breed,
        sex: (row.dog.sex === 'female' ? 'female' : 'male') as 'male' | 'female',
        callName: row.dog.call_name ?? '',
        ownerId: row.handler_id,
        ...(row.dog.date_of_birth != null ? { dateOfBirth: row.dog.date_of_birth } : {}),
        gender: row.dog.sex === 'female' ? 'Female' : 'Male',
        registrations: [],
      },
    },
    ringStatus: {
      classId: cls.id,
      className: cls.name,
      ringNumber: cls.ring_number ?? 0,
      judgeName: cls.judge_name ?? '',
      judgeStatus: 'active',
      totalEntries: 0,
      completedEntries: 0,
      onDeck: [],
      lastUpdated: new Date(),
    },
  };
}

async function fetchCheckInData(
  entryId: string,
  userId: string
): Promise<ExhibitorClassInfo | null> {
  const { data, error } = await supabase
    .from('entries')
    .select(
      `
      id, check_in_status, armband, run_order, handler_id,
      dog:dogs!inner(id, call_name, breed, sex, date_of_birth),
      class:classes!inner(
        id, name, element, level, max_entries, ring_number, start_time, judge_name,
        trial:trials!inner(
          id, name, date, planned_start_time,
          show:shows!inner(id, name, location)
        )
      )
    `
    )
    .eq('id', entryId)
    .eq('handler_id', userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  return mapRowToClassInfo(data as unknown as CheckInDataRow);
}

export function useClassCheckInData(entryId: string) {
  const { userWithRoles } = useAuthContext();
  const userId = userWithRoles?.databaseUserId ?? '';

  return useQuery({
    queryKey: ['entries', entryId, 'checkin-data'],
    queryFn: () => fetchCheckInData(entryId, userId),
    enabled: !!entryId && !!userId,
    staleTime: 30_000,
    gcTime: 60_000,
    retry: 1,
  });
}
