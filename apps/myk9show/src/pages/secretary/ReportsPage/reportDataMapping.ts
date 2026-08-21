import { mapDbEntryToReportEntry, resolveReportHandlerName } from '@/lib/reports/reportUtils';
import { resolveClassSection } from '@/services/entryDisplay/entryDisplaySelectors';
import { REPORT_ENTRY_SOURCE } from '@/lib/reports/types';
import { resolveClassJudgeName, resolveTrialJudgeName } from '@/utils/classJudgeDisplay';
import type { ReportEntry, ReportProps, ReportScope } from '@/lib/reports/types';
import type { DbTrial, DbClass, DbEntry } from '@/types/database-mappings';
import type { Show } from '@/types/show-types';
import type { ShowJudgeAssignment } from '@/types/judge-types';
import type { EmergencyPacketInput } from '@/features/emergency-trial-packet/types';
import { formatRingLabel } from '@/utils/ringLabel';

export function mapReportEntries(
  dbEntries: DbEntry[],
  trial?: DbTrial,
  classData?: DbClass,
  assignedJudges: ReadonlyArray<ShowJudgeAssignment> = []
): ReportEntry[] {
  return dbEntries.map(e => mapReportEntry(e, trial, classData, assignedJudges));
}

/**
 * Filter entries to the selected (trial, class) scope and enrich each with its
 * OWN trial + class, mirroring how ReportPreview pairs entries via buildPages.
 *
 * useReportData returns ALL show entries whenever `classId === 'all'`, so a
 * naive map with a single fallback trial/class would print cross-trial entries
 * under the wrong trial (and lose per-entry class text for All Trials). This
 * resolves each entry's real class/trial instead.
 *
 * - `classId !== 'all'`: entries are already class-scoped by useReportData, so
 *   enrich them all with the selected class (no class_id dependency).
 * - `classId === 'all', trialId !== 'all'`: keep only entries whose class
 *   belongs to the selected trial, enriching each with its own class/trial.
 * - both 'all': keep everything, enriching each with its own class/trial.
 */
export function mapScopedReportEntries(
  dbEntries: DbEntry[],
  trials: DbTrial[],
  classes: DbClass[],
  scope: ReportScope,
  assignedJudges: ReadonlyArray<ShowJudgeAssignment> = []
): ReportEntry[] {
  const classById = new Map(classes.map(c => [c.id, c] as const));
  const trialById = new Map(trials.map(t => [t.id, t] as const));

  const enrichByEntryClass = (e: DbEntry): ReportEntry => {
    const cls = e.class_id != null ? classById.get(e.class_id) : undefined;
    const trial = cls?.trial_id != null ? trialById.get(cls.trial_id) : undefined;
    return mapReportEntry(e, trial, cls, assignedJudges);
  };

  if (scope.kind === 'class') {
    const cls = classById.get(scope.classId);
    const trial = cls?.trial_id != null ? trialById.get(cls.trial_id) : undefined;
    return dbEntries
      .filter(entry => entry.class_id === scope.classId)
      .map(entry => mapReportEntry(entry, trial, cls, assignedJudges));
  }

  if (scope.kind === 'trial') {
    const trialClassIds = new Set(classes.filter(c => c.trial_id === scope.trialId).map(c => c.id));
    return dbEntries
      .filter(e => e.class_id != null && trialClassIds.has(e.class_id))
      .map(enrichByEntryClass);
  }

  return dbEntries.map(enrichByEntryClass);
}

function mapReportEntry(
  e: DbEntry,
  trial?: DbTrial,
  classData?: DbClass,
  assignedJudges: ReadonlyArray<ShowJudgeAssignment> = []
): ReportEntry {
  const dog = (e as Record<string, unknown>).dog as Record<string, unknown> | null;
  const registration = (e as Record<string, unknown>).registration as Record<
    string,
    unknown
  > | null;
  const handlerName = resolveReportHandlerName(e.handler);
  const armbandNum = e.armband != null ? Number(e.armband) : null;
  const entrySource = readEntrySource(e.entry_source);
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
    ...(e.dog_id ? { dogId: e.dog_id } : {}),
    ...(e.entry_status ? { entryStatus: e.entry_status } : {}),
    ...(e.entry_fee != null ? { entryFee: Number(e.entry_fee) } : {}),
    ...(e.payment_status
      ? { paymentStatus: e.payment_status as NonNullable<ReportEntry['paymentStatus']> }
      : {}),
    ...(e.payment_method ? { paymentMethod: e.payment_method } : {}),
    ...(typeof registration?.payment_status === 'string'
      ? {
          enrollmentPaymentStatus: registration.payment_status as NonNullable<
            ReportEntry['enrollmentPaymentStatus']
          >,
        }
      : {}),
    ...(e.discount_amount != null ? { discountAmount: Number(e.discount_amount) } : {}),
    ...(e.refund_amount != null ? { refundAmount: Number(e.refund_amount) } : {}),
    ...(e.comped != null ? { comped: Boolean(e.comped) } : {}),
    ...(entrySource ? { entrySource } : {}),
    ...(e.is_day_of_show != null ? { isDayOfShow: Boolean(e.is_day_of_show) } : {}),
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
          classSection: resolveClassSection(classData.section),
          judgeName: resolveClassJudgeName(classData, assignedJudges),
        }
      : {}),
  };
}

function readEntrySource(entrySource: string | null | undefined): ReportEntry['entrySource'] {
  if (entrySource === REPORT_ENTRY_SOURCE.MYK9 || entrySource === REPORT_ENTRY_SOURCE.UKC_ONLINE) {
    return entrySource;
  }

  return undefined;
}

export function readTrialRegistryId(trial: DbTrial): string {
  // Read trials.registry_id; default older rows to AKC.
  return trial.registry_id?.trim() || 'AKC';
}

export function mapReportTrialFields(
  trial: DbTrial
): Pick<NonNullable<ReportProps['trial']>, 'date' | 'eventNumber' | 'registryId' | 'trialNumber'> {
  return {
    date: trial.date ?? '',
    ...(trial.event_number ? { eventNumber: trial.event_number } : {}),
    registryId: readTrialRegistryId(trial),
    trialNumber: String(trial.trial_number ?? ''),
  };
}

export function buildTrialReportProps(input: {
  show: Show;
  trials: DbTrial[] | null | undefined;
  classes: DbClass[] | null | undefined;
  entries: DbEntry[] | null | undefined;
  scope: Extract<ReportScope, { kind: 'show' | 'trial' }>;
  sortOrder: string;
}): ReportProps[] {
  const { show, trials, classes, entries, scope, sortOrder } = input;
  const targetTrials =
    scope.kind === 'show'
      ? (trials ?? [])
      : (trials ?? []).filter(trial => trial.id === scope.trialId);

  const allClasses = (classes ?? []).map(c => ({
    id: c.id,
    trialId: c.trial_id ?? '',
    element: c.element ?? '',
    level: c.level ?? '',
    section: resolveClassSection(c.section),
    judgeName: resolveClassJudgeName(c, show.assignedJudges ?? []),
  }));

  return targetTrials.map(trial => {
    const trialClasses = (classes ?? []).filter(c => c.trial_id === trial.id);
    const trialEntries = (entries ?? []).filter(e => trialClasses.some(c => c.id === e.class_id));
    const enriched = trialEntries.map(e => {
      const cls = trialClasses.find(c => c.id === e.class_id);
      return mapReportEntry(e, trial, cls, show.assignedJudges ?? []);
    });

    return {
      showId: show.id,
      showName: show.name ?? '',
      trial: {
        ...mapReportTrialFields(trial),
        judgeName: resolveTrialJudgeName(trialClasses, show.assignedJudges ?? []),
      },
      allClasses: allClasses.filter(c => c.trialId === trial.id),
      entries: enriched,
      sortOrder,
      organization: show.organization ?? undefined,
      clubName: show.clubName ?? undefined,
    };
  });
}

export function buildClassReportProps(input: {
  show: Show;
  trials: DbTrial[] | null | undefined;
  classes: DbClass[] | null | undefined;
  entries: DbEntry[] | null | undefined;
  scope: Extract<ReportScope, { kind: 'class' }>;
  sortOrder: string;
}): ReportProps | null {
  const { show, trials, classes, entries, scope, sortOrder } = input;

  const classData = (classes ?? []).find(cls => cls.id === scope.classId);
  if (!classData) return null;

  const trial = (trials ?? []).find(item => item.id === (classData.trial_id ?? scope.trialId));
  if (!trial) return null;

  const classEntries = (entries ?? []).filter(entry => entry.class_id === scope.classId);

  return {
    showId: show.id,
    showName: show.name ?? '',
    trial: {
      ...mapReportTrialFields(trial),
      judgeName: resolveClassJudgeName(classData, show.assignedJudges ?? []),
    },
    classData: {
      element: classData.element ?? '',
      level: classData.level ?? '',
      section: resolveClassSection(classData.section),
      timeLimitSeconds: classData.time_limit_seconds,
      timeLimitArea2Seconds: classData.time_limit_area2_seconds,
      timeLimitArea3Seconds: classData.time_limit_area3_seconds,
      areaCount: classData.num_areas,
      hidesText: classData.num_hides ? String(classData.num_hides) : null,
      distractionsText: classData.distraction_count ? String(classData.distraction_count) : null,
    },
    entries: mapReportEntries(classEntries, trial, classData, show.assignedJudges ?? []),
    sortOrder,
    organization: show.organization ?? undefined,
    clubName: show.clubName ?? undefined,
  };
}

export function buildEmergencyPacketData(input: {
  show: Show;
  trials: DbTrial[] | null | undefined;
  classes: DbClass[] | null | undefined;
  entries: DbEntry[] | null | undefined;
}): Omit<EmergencyPacketInput, 'generatedAt'> {
  const trials = input.trials ?? [];
  const classes = input.classes ?? [];
  const entries = input.entries ?? [];
  const scope: ReportScope = { kind: 'show', showId: input.show.id };
  const mappedEntries = mapScopedReportEntries(
    entries,
    trials,
    classes,
    scope,
    input.show.assignedJudges ?? []
  );

  return {
    show: {
      id: input.show.id,
      name: input.show.name ?? '',
      clubName: input.show.clubName ?? undefined,
      organization: input.show.organization ?? undefined,
      startDate: input.show.startDate ?? '',
      endDate: input.show.endDate ?? input.show.startDate ?? '',
    },
    trials: trials.map(trial => ({
      id: trial.id,
      date: trial.date ?? '',
      name: trial.name ?? `Trial ${trial.trial_number ?? ''}`.trim(),
      trialNumber: String(trial.trial_number ?? ''),
      registryId: readTrialRegistryId(trial),
    })),
    classes: classes.map(classItem => {
      const raw = classItem as DbClass & Record<string, unknown>;
      const ringLabel = formatRingLabel(
        (raw.ring ?? raw.ring_number ?? raw.ringNumber) as string | number | null | undefined
      );
      return {
        id: classItem.id,
        trialId: classItem.trial_id ?? '',
        name:
          classItem.name ??
          [classItem.element, classItem.level, resolveClassSection(classItem.section)]
            .filter(Boolean)
            .join(' '),
        element: classItem.element ?? '',
        level: classItem.level ?? '',
        section: resolveClassSection(classItem.section),
        classNumber: classItem.class_number,
        displayOrder: classItem.display_order,
        judgeName: resolveClassJudgeName(classItem, input.show.assignedJudges ?? []),
        ringLabel: ringLabel ?? 'Ring unassigned',
        startTime: classItem.start_time,
        timeLimitSeconds: classItem.time_limit_seconds,
        timeLimitArea2Seconds: (raw.time_limit_area2_seconds as number | null) ?? null,
        timeLimitArea3Seconds: (raw.time_limit_area3_seconds as number | null) ?? null,
      };
    }),
    entries: mappedEntries,
  };
}
