import { isValidUUID } from '@/utils/validation';

export const SHOW_INCIDENT_TYPES = [
  { id: 'bite', label: 'Bite / aggression' },
  { id: 'complaint', label: 'Complaint' },
  { id: 'dq', label: 'Disqualification' },
  { id: 'injury', label: 'Injury' },
  { id: 'other', label: 'Other' },
] as const;

export const SHOW_INCIDENT_SEVERITIES = [
  { id: 'note', label: 'Note' },
  { id: 'reportable', label: 'Reportable' },
  { id: 'urgent', label: 'Urgent' },
] as const;

export type ShowIncidentType = (typeof SHOW_INCIDENT_TYPES)[number]['id'];
export type ShowIncidentSeverity = (typeof SHOW_INCIDENT_SEVERITIES)[number]['id'];

export interface IncidentEntryOption {
  classId?: string | null;
  dogId?: string | null;
  dogName?: string | null;
  handlerId?: string | null;
  handlerName?: string | null;
  id: string;
  label: string;
  trialId?: string | null;
}

export interface IncidentJudgeOption {
  id: string;
  name: string;
  personId?: string | null;
}

export interface ShowIncidentRecord {
  action_taken: string | null;
  created_at: string;
  created_by_name: string | null;
  description: string | null;
  dog_name: string | null;
  handler_name: string | null;
  id: string;
  incident_type: ShowIncidentType;
  judge_name: string | null;
  occurred_at: string;
  severity: ShowIncidentSeverity;
  summary: string;
}

export interface ShowIncidentFormInput {
  actionTaken?: string;
  createdBy: string;
  createdByName?: string | null;
  description?: string;
  entry?: IncidentEntryOption | null;
  incidentType: ShowIncidentType;
  judge?: IncidentJudgeOption | null;
  occurredAt?: string;
  severity: ShowIncidentSeverity;
  showId: string;
  summary: string;
}

export interface ShowIncidentInsertPayload {
  action_taken: string | null;
  class_id: string | null;
  created_by: string;
  created_by_name: string | null;
  description: string | null;
  dog_id: string | null;
  dog_name: string | null;
  entry_id: string | null;
  handler_id: string | null;
  handler_name: string | null;
  incident_type: ShowIncidentType;
  judge_id: string | null;
  judge_name: string | null;
  occurred_at?: string;
  severity: ShowIncidentSeverity;
  show_id: string;
  summary: string;
  trial_id: string | null;
}

export interface ShowIncidentSummary {
  totalCount: number;
  reportableCount: number;
  urgentCount: number;
  latestReportable: ShowIncidentRecord | null;
}

function requiredText(value: string, fallback: string): string {
  const cleaned = value.trim();
  if (!cleaned) throw new Error(fallback);
  return cleaned;
}

function optionalText(value: string | null | undefined): string | null {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}

function optionalUuid(value: string | null | undefined): string | null {
  const cleaned = optionalText(value);
  return cleaned && isValidUUID(cleaned) ? cleaned : null;
}

export function buildShowIncidentPayload(input: ShowIncidentFormInput): ShowIncidentInsertPayload {
  const summary = requiredText(input.summary, 'Add a short incident summary before saving');
  const entry = input.entry ?? null;
  const judge = input.judge ?? null;
  const occurredAt = optionalText(input.occurredAt);

  return {
    action_taken: optionalText(input.actionTaken),
    class_id: entry?.classId ?? null,
    created_by: input.createdBy,
    created_by_name: optionalText(input.createdByName),
    description: optionalText(input.description),
    dog_id: entry?.dogId ?? null,
    dog_name: optionalText(entry?.dogName),
    entry_id: entry?.id ?? null,
    handler_id: entry?.handlerId ?? null,
    handler_name: optionalText(entry?.handlerName),
    incident_type: input.incidentType,
    judge_id: optionalUuid(judge?.personId) ?? optionalUuid(judge?.id),
    judge_name: optionalText(judge?.name),
    ...(occurredAt ? { occurred_at: occurredAt } : {}),
    severity: input.severity,
    show_id: input.showId,
    summary,
    trial_id: entry?.trialId ?? null,
  };
}

export function formatIncidentType(type: ShowIncidentType): string {
  return SHOW_INCIDENT_TYPES.find(item => item.id === type)?.label ?? 'Incident';
}

export function summarizeShowIncidents(incidents: ShowIncidentRecord[]): ShowIncidentSummary {
  const orderedIncidents = [...incidents].sort(
    (a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at)
  );
  const summary: ShowIncidentSummary = {
    totalCount: orderedIncidents.length,
    reportableCount: 0,
    urgentCount: 0,
    latestReportable: null,
  };

  for (const incident of orderedIncidents) {
    if (incident.severity === 'urgent') {
      summary.urgentCount += 1;
    }

    if (incident.severity === 'reportable' || incident.severity === 'urgent') {
      summary.reportableCount += 1;
      summary.latestReportable ??= incident;
    }
  }

  return summary;
}
