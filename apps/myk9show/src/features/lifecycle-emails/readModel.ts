import {
  LIFECYCLE_EMAIL_STEP_TYPES,
  type LifecycleEmailJobStatus,
  type LifecycleEmailStepType,
} from './types';

export interface LifecycleEmailStepSetting {
  stepType: LifecycleEmailStepType;
  isEnabled: boolean;
}

export interface LifecycleEmailJobSummaryRow {
  stepType: LifecycleEmailStepType;
  status: LifecycleEmailJobStatus;
  previewWarnings?: readonly string[] | null;
}

export interface LifecycleEmailReceiptSource {
  registrationId: string | null | undefined;
  paymentMethod?: string | null;
  entrySource?: string | null;
}

export interface LifecycleEmailReceiptLogRow {
  relatedId: string | null;
  status: string;
  errorMessage?: string | null;
  createdAt: string;
}

export interface LifecycleEmailStepSummary {
  stepType: LifecycleEmailStepType;
  isEnabled: boolean;
  readyCount: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  dismissedCount: number;
  warningCount: number;
}

export interface LifecycleEmailReceiptSummary {
  sentCount: number;
  failedCount: number;
  latestSentAtByRegistrationId: Record<string, string>;
}

export interface LifecycleEmailScheduledSummary {
  steps: LifecycleEmailStepSummary[];
  receipts: LifecycleEmailReceiptSummary;
}

export function buildDefaultLifecycleEmailStepSettings(): LifecycleEmailStepSetting[] {
  return LIFECYCLE_EMAIL_STEP_TYPES.map(stepType => ({ stepType, isEnabled: true }));
}

export function buildLifecycleEmailScheduledSummary(input: {
  steps?: readonly LifecycleEmailStepSetting[] | null;
  jobs?: readonly LifecycleEmailJobSummaryRow[] | null;
  receiptSources?: readonly LifecycleEmailReceiptSource[] | null;
  receiptLogs?: readonly LifecycleEmailReceiptLogRow[] | null;
}): LifecycleEmailScheduledSummary {
  const settings = mergeStepSettings(input.steps ?? []);
  const stepMap = new Map<LifecycleEmailStepType, LifecycleEmailStepSummary>();

  for (const setting of settings) {
    stepMap.set(setting.stepType, {
      stepType: setting.stepType,
      isEnabled: setting.isEnabled,
      readyCount: 0,
      sentCount: 0,
      failedCount: 0,
      skippedCount: 0,
      dismissedCount: 0,
      warningCount: 0,
    });
  }

  for (const job of input.jobs ?? []) {
    const summary = stepMap.get(job.stepType);
    if (!summary) continue;
    if (job.status === 'ready') summary.readyCount += 1;
    if (job.status === 'sent') summary.sentCount += 1;
    if (job.status === 'failed') summary.failedCount += 1;
    if (job.status === 'skipped') summary.skippedCount += 1;
    if (job.status === 'dismissed') summary.dismissedCount += 1;
    if ((job.previewWarnings?.length ?? 0) > 0) summary.warningCount += 1;
  }

  return {
    steps: [...stepMap.values()],
    receipts: buildReceiptSummary(input.receiptSources ?? [], input.receiptLogs ?? []),
  };
}

export function shouldShowAutomaticReceiptForEntry(source: LifecycleEmailReceiptSource): boolean {
  if (!source.registrationId) return false;
  if (source.entrySource === 'ukc_online') return true;
  return source.paymentMethod === 'online';
}

function mergeStepSettings(
  rows: readonly LifecycleEmailStepSetting[]
): LifecycleEmailStepSetting[] {
  const byType = new Map<LifecycleEmailStepType, boolean>(
    buildDefaultLifecycleEmailStepSettings().map(row => [row.stepType, row.isEnabled])
  );

  for (const row of rows) {
    byType.set(row.stepType, row.isEnabled);
  }

  return LIFECYCLE_EMAIL_STEP_TYPES.map(stepType => ({
    stepType,
    isEnabled: byType.get(stepType) ?? true,
  }));
}

function buildReceiptSummary(
  sources: readonly LifecycleEmailReceiptSource[],
  logs: readonly LifecycleEmailReceiptLogRow[]
): LifecycleEmailReceiptSummary {
  const onlineRegistrationIds = new Set(
    sources
      .filter(shouldShowAutomaticReceiptForEntry)
      .map(source => source.registrationId)
      .filter((id): id is string => !!id)
  );
  const latestSentAtByRegistrationId: Record<string, string> = {};
  let sentCount = 0;
  let failedCount = 0;

  for (const log of logs) {
    if (!log.relatedId || !onlineRegistrationIds.has(log.relatedId)) continue;
    if (log.status === 'failed' || log.status === 'bounced' || log.status === 'complained') {
      failedCount += 1;
    } else {
      sentCount += 1;
      const latestSentAt = latestSentAtByRegistrationId[log.relatedId];
      if (!latestSentAt || Date.parse(log.createdAt) > Date.parse(latestSentAt)) {
        latestSentAtByRegistrationId[log.relatedId] = log.createdAt;
      }
    }
  }

  return { sentCount, failedCount, latestSentAtByRegistrationId };
}
