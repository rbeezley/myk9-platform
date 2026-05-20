import { mapDbEntryToReportEntry } from '@/lib/reports/reportUtils';
import type { ReportEntry, ReportProps } from '@/lib/reports/types';
import type { DbTrial, DbClass, DbEntry } from '@/types/database-mappings';
import type { Show } from '@/types/show-types';

export function mapReportEntries(
  dbEntries: DbEntry[],
  trial?: DbTrial,
  classData?: DbClass
): ReportEntry[] {
  return dbEntries.map(e => mapReportEntry(e, trial, classData));
}

function mapReportEntry(e: DbEntry, trial?: DbTrial, classData?: DbClass): ReportEntry {
  const dog = (e as Record<string, unknown>).dog as Record<string, unknown> | null;
  const owner = dog?.owner as Record<string, unknown> | null;
  const handlerName = owner ? `${owner.first_name ?? ''} ${owner.last_name ?? ''}`.trim() : '';
  const armbandNum = e.armband != null ? Number(e.armband) : null;
  const base = mapDbEntryToReportEntry(
    {
      id: e.id,
      armband: armbandNum,
      run_order: e.run_order,
      check_in_status: e.check_in_status,
      section: null,
      is_scored: e.is_scored,
      result_status: e.result_status,
      search_time_seconds: e.search_time_seconds,
      total_faults: e.total_faults,
      final_placement: e.final_placement,
    },
    (dog?.call_name as string) ?? `Dog ${e.armband ?? '?'}`,
    (dog?.breed as string) ?? '',
    handlerName,
    null
  );
  return {
    ...base,
    ...(e.entry_fee != null ? { entryFee: Number(e.entry_fee) } : {}),
    ...(e.payment_status
      ? { paymentStatus: e.payment_status as NonNullable<ReportEntry['paymentStatus']> }
      : {}),
    ...(e.payment_method ? { paymentMethod: e.payment_method } : {}),
    ...(trial
      ? {
          trialId: trial.id,
          trialNumber: String(trial.trial_number ?? ''),
          trialDate: trial.date ?? '',
        }
      : {}),
    ...(classData
      ? {
          classId: classData.id,
          classElement: classData.element ?? '',
          classLevel: classData.level ?? '',
          classSection: classData.section ?? '',
          ...(classData.judge_name ? { judgeName: classData.judge_name } : {}),
        }
      : {}),
  };
}

export function buildTrialReportProps(input: {
  show: Show;
  trials: DbTrial[] | null | undefined;
  classes: DbClass[] | null | undefined;
  entries: DbEntry[] | null | undefined;
  trialId: string;
  sortOrder: string;
}): ReportProps[] {
  const { show, trials, classes, entries, trialId, sortOrder } = input;
  const targetTrials =
    trialId === 'all' ? (trials ?? []) : (trials ?? []).filter(trial => trial.id === trialId);

  const allClasses = (classes ?? []).map(c => ({
    id: c.id,
    trialId: c.trial_id ?? '',
    element: c.element ?? '',
    level: c.level ?? '',
    section: c.section ?? '',
    ...(c.judge_name ? { judgeName: c.judge_name } : {}),
  }));

  return targetTrials.map(trial => {
    const trialClasses = (classes ?? []).filter(c => c.trial_id === trial.id);
    const trialEntries = (entries ?? []).filter(e => trialClasses.some(c => c.id === e.class_id));
    const enriched = trialEntries.map(e => {
      const cls = trialClasses.find(c => c.id === e.class_id);
      return mapReportEntry(e, trial, cls);
    });
    const firstClassJudge = trialClasses[0]?.judge_name ?? 'TBD';

    return {
      showId: show.id,
      showName: show.name ?? '',
      trial: {
        date: trial.date ?? '',
        trialNumber: String(trial.trial_number ?? ''),
        judgeName: firstClassJudge,
      },
      allClasses: allClasses.filter(c => c.trialId === trial.id),
      entries: enriched,
      sortOrder,
      organization: show.organization ?? undefined,
      clubName: show.clubName ?? undefined,
    };
  });
}
