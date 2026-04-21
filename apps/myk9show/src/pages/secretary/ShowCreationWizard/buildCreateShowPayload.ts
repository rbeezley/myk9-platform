import { format } from 'date-fns';
import type { SportClassRuleRow } from '@/types/sport-template-types';
import type { ReplicatedShow } from '@/services/replication/ReplicatedShowsTable';
import type { ReplicatedTrial } from '@/services/replication/ReplicatedTrialsTable';
import type { ReplicatedClass } from '@/services/replication/ReplicatedClassesTable';
import type { JudgeDetailsMap, ShowStatus } from './show-creation-wizard-types';
import {
  createClassDataFromWizard,
  type WizardShowData,
  type WizardTrial,
} from './showCreationWizardTransformers';

export interface ShowRpcPayload {
  id: string;
  name: string;
  organization: string;
  start_date: string;
  end_date: string;
  location: string | null;
  status: string;
  club_id: string;
  entry_open_date: string | null;
  entry_close_date: string | null;
  pre_entry_fee: number | null;
  day_of_show_fee: number | null;
  accept_check_payments: boolean | null;
  accept_cash_payments: boolean | null;
}

export interface TrialRpcPayload {
  id: string;
  name: string;
  date: string;
  trial_number: string | null;
  status: string;
  trial_type: string | null;
  planned_start_time: string | null;
  event_number: string | null;
  display_order: number | null;
  category: string | null;
}

export interface ClassRpcPayload {
  id: string;
  trial_id: string;
  name: string;
  level: string | null;
  element: string | null;
  section: string | null;
  entry_fee: number | null;
  max_entries: number | null;
  status: string;
  start_time: string | null;
  timer_mode: string | null;
  hides_known: boolean | null;
  distraction_count: number | null;
  num_areas: number | null;
  time_limit_seconds: number | null;
}

export interface CreateShowRpcInput {
  p_show: ShowRpcPayload;
  p_trials: TrialRpcPayload[];
  p_classes: ClassRpcPayload[];
  p_judge_ids: string[];
}

export interface CreateShowPayloadResult {
  rpcInput: CreateShowRpcInput;
  localEntities: {
    show: ReplicatedShow;
    trials: ReplicatedTrial[];
    classes: ReplicatedClass[];
  };
  showId: string;
  trialIdMap: Record<string, string>;
}

function mapShowStatus(status: ShowStatus): 'draft' | 'published' {
  return status === 'published' ? 'published' : 'draft';
}

/**
 * Pure function: transform wizard state into the payload for the
 * create_show_with_children RPC plus the local IndexedDB entities to write
 * after the RPC succeeds (with _syncStatus: 'synced' so no re-upload is queued).
 *
 * Only valid for new shows (no edit mode). The ruleMap must be pre-fetched
 * by the caller so this function stays synchronous and easily testable.
 */
export function buildCreateShowPayload(
  show: WizardShowData,
  trials: WizardTrial[],
  judgeDetails: JudgeDetailsMap,
  ruleMap: Map<string, SportClassRuleRow>,
  status: ShowStatus
): CreateShowPayloadResult {
  const showId = crypto.randomUUID();
  const dbStatus = mapShowStatus(status);

  const trialIdMap: Record<string, string> = {};
  const trialPayloads: TrialRpcPayload[] = trials.map((wizardTrial, index) => {
    const trialId = crypto.randomUUID();
    trialIdMap[wizardTrial.id] = trialId;
    const trialName = wizardTrial.name || `Trial ${index + 1}`;
    return {
      id: trialId,
      name: trialName,
      date: wizardTrial.dateTime
        ? new Date(wizardTrial.dateTime).toISOString().split('T')[0]!
        : new Date().toISOString().split('T')[0]!,
      trial_number: trialName,
      status: 'upcoming',
      trial_type: wizardTrial.trialType || show.organization || null,
      planned_start_time: wizardTrial.dateTime
        ? format(new Date(wizardTrial.dateTime), 'h:mm a')
        : '09:00 AM',
      event_number: wizardTrial.eventNumber || null,
      display_order: index + 1,
      category: trialName,
    };
  });

  const allClassData = createClassDataFromWizard(
    trials,
    trialIdMap,
    judgeDetails,
    showId,
    [],
    undefined
  );

  const classPayloads: ClassRpcPayload[] = allClassData.map(cls => {
    const rule = cls.templateId
      ? ruleMap.get(`${cls.templateId}|${cls.element ?? ''}|${cls.level ?? ''}`)
      : undefined;
    return {
      id: cls.id || crypto.randomUUID(),
      trial_id: cls.trialId,
      name: cls.className || cls.element || 'Class',
      level: cls.level || null,
      element: cls.element || null,
      section: cls.section || null,
      entry_fee: cls.preEntryFee ?? cls.entryFee ?? null,
      max_entries: cls.maxEntries ?? null,
      status: 'upcoming',
      start_time: cls.startTime || null,
      timer_mode: rule?.timer_mode ?? null,
      hides_known: rule?.hides_known ?? null,
      distraction_count: rule?.distraction_count_min ?? null,
      num_areas: rule?.area_count ?? null,
      time_limit_seconds: rule?.max_time_seconds_fixed ?? null,
    };
  });

  const localShow: ReplicatedShow = {
    id: showId,
    name: show.name,
    organization: show.organization,
    startDate: show.startDate,
    endDate: show.endDate,
    location: show.location || undefined,
    status: dbStatus,
    clubId: show.clubId,
    entryOpenDate: show.entryOpenDate || undefined,
    entryCloseDate: show.entryCloseDate || undefined,
    preEntryFee: show.preEntryFee ?? undefined,
    dayOfShowFee: show.dayOfShowFee ?? undefined,
    acceptCheckPayments: show.acceptCheckPayments,
    acceptCashPayments: show.acceptCashPayments,
    _version: 1,
    _lastModified: new Date(),
    _syncStatus: 'synced',
    _localOnly: false,
  };

  const localTrials: ReplicatedTrial[] = trialPayloads.map(t => ({
    id: t.id,
    showId,
    name: t.name,
    date: t.date,
    trialNumber: t.trial_number ?? undefined,
    status: t.status,
    trialType: t.trial_type ?? undefined,
    plannedStartTime: t.planned_start_time ?? undefined,
    eventNumber: t.event_number ?? undefined,
    displayOrder: t.display_order ?? undefined,
    category: t.category ?? undefined,
    _version: 1,
    _lastModified: new Date(),
    _syncStatus: 'synced',
    _localOnly: false,
  }));

  const localClasses: ReplicatedClass[] = classPayloads.map(c => ({
    id: c.id,
    trialId: c.trial_id,
    trial_id: c.trial_id,
    name: c.name,
    level: c.level ?? undefined,
    element: c.element ?? undefined,
    section: c.section ?? undefined,
    entryFee: c.entry_fee ?? undefined,
    maxEntries: c.max_entries ?? undefined,
    classStatus: c.status,
    startTime: c.start_time ?? undefined,
    timerMode: c.timer_mode ?? undefined,
    hidesKnown: c.hides_known ?? undefined,
    distractionCount: c.distraction_count ?? undefined,
    areaCount: c.num_areas ?? undefined,
    timeLimitSeconds: c.time_limit_seconds ?? undefined,
    _version: 1,
    _lastModified: new Date(),
    _syncStatus: 'synced',
    _localOnly: false,
  }));

  return {
    rpcInput: {
      p_show: {
        id: showId,
        name: show.name,
        organization: show.organization,
        start_date: show.startDate,
        end_date: show.endDate,
        location: show.location || null,
        status: dbStatus,
        club_id: show.clubId,
        entry_open_date: show.entryOpenDate || null,
        entry_close_date: show.entryCloseDate || null,
        pre_entry_fee: show.preEntryFee ?? null,
        day_of_show_fee: show.dayOfShowFee ?? null,
        accept_check_payments: show.acceptCheckPayments,
        accept_cash_payments: show.acceptCashPayments,
      },
      p_trials: trialPayloads,
      p_classes: classPayloads,
      p_judge_ids: show.judgeIds,
    },
    localEntities: { show: localShow, trials: localTrials, classes: localClasses },
    showId,
    trialIdMap,
  };
}
