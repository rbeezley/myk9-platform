export type EmailDeliveryStatus =
  'delivered' | 'sent' | 'bounced' | 'failed' | 'complained' | 'unavailable';

export interface EmailDeliveryRpcRow {
  id: string;
  show_id: string;
  source_kind: string;
  lifecycle_step_type: string | null;
  related_id: string | null;
  recipient_name: string | null;
  recipient_email: string | null;
  attempted_at: string;
  status_updated_at: string | null;
  delivery_status: string;
  failure_summary: string | null;
}

export interface EmailDeliveryHistoryRow {
  id: string;
  showId: string;
  sourceKind: string;
  typeLabel: string;
  recipient: string;
  attemptedAt: string;
  relevantAt: string;
  status: EmailDeliveryStatus;
  statusLabel: string;
  failureSummary: string | null;
  recoveryHref: string | null;
}

export function normalizeEmailDeliveryRow(row: EmailDeliveryRpcRow): EmailDeliveryHistoryRow {
  const status = normalizeStatus(row.delivery_status);
  return {
    id: row.id,
    showId: row.show_id,
    sourceKind: row.source_kind,
    typeLabel: getEmailTypeLabel(row.source_kind, row.lifecycle_step_type),
    recipient: formatRecipient(row.recipient_name, row.recipient_email),
    attemptedAt: row.attempted_at,
    relevantAt: row.status_updated_at ?? row.attempted_at,
    status,
    statusLabel: getEmailDeliveryStatusPresentation(status).label,
    failureSummary: row.failure_summary,
    recoveryHref: getEmailRecoveryHref(row.source_kind, row.show_id),
  };
}

export function getEmailDeliveryStatusPresentation(status: string): {
  kind: EmailDeliveryStatus;
  label: string;
  description: string;
} {
  switch (normalizeStatus(status)) {
    case 'delivered':
      return {
        kind: 'delivered',
        label: 'Delivered',
        description: 'The provider confirmed delivery.',
      };
    case 'sent':
      return {
        kind: 'sent',
        label: 'Sent — awaiting delivery confirmation',
        description: 'The provider accepted the email; delivery is not confirmed yet.',
      };
    case 'bounced':
    case 'failed':
    case 'complained':
      return {
        kind: 'failed',
        label: 'Needs attention',
        description: 'This email needs review.',
      };
    case 'unavailable':
      return {
        kind: 'unavailable',
        label: 'Status unavailable',
        description: 'The provider returned a status this history does not recognize.',
      };
  }
}

export function getEmailRecoveryHref(sourceKind: string, showId: string): string | null {
  switch (sourceKind) {
    case 'registration_confirmation':
    case 'heritage_confirmation':
    case 'show_reminder':
    case 'entry_decision':
      return `/shows/${showId}/entries`;
    case 'lifecycle':
      return `/secretary/messages?showId=${showId}&view=email#scheduled-emails`;
    case 'waitlist_notification':
      return `/shows/${showId}/entries?tab=waitlist`;
    case 'registry_results_submission':
      return `/shows/${showId}/results?step=submit`;
    case 'registry_deadline_reminder':
      return `/shows/${showId}/results#finish-the-show`;
    default:
      return null;
  }
}

function normalizeStatus(status: string): EmailDeliveryStatus {
  switch (status.toLowerCase()) {
    case 'delivered':
      return 'delivered';
    case 'sent':
      return 'sent';
    case 'bounced':
      return 'bounced';
    case 'failed':
      return 'failed';
    case 'complained':
      return 'complained';
    default:
      return 'unavailable';
  }
}

function formatRecipient(name: string | null, email: string | null): string {
  const safeName = name?.trim();
  const safeEmail = email?.trim();
  if (safeName && safeEmail) return `${safeName} (${safeEmail})`;
  return safeName || safeEmail || 'Details unavailable';
}

function getEmailTypeLabel(sourceKind: string, lifecycleStepType: string | null): string {
  if (sourceKind === 'lifecycle' && lifecycleStepType) {
    // MYK9-2124: sent by the server on its own, so it names what happened to the show.
    if (lifecycleStepType === 'show_changed') return 'Date or venue changed';
    // MYK9-2125: the same, when a class's judge changes.
    if (lifecycleStepType === 'judge_changed') return 'Judge changed';
    // MYK9-2126: and when the secretary edits, moves or pulls their entry.
    if (lifecycleStepType === 'entry_changed') return 'Entry changed';
    // MYK9-2001: when she pulls or withdraws, and when the refund is decided.
    if (lifecycleStepType === 'pulled_out') return 'Pulled out';
    if (lifecycleStepType === 'refund_outcome') return 'Refund decided';
    // MYK9-2127: and when the show is cancelled.
    if (lifecycleStepType === 'show_cancelled') return 'Show cancelled';
    return `Lifecycle — ${lifecycleStepType.replace(/_/g, ' ')}`;
  }
  switch (sourceKind) {
    // MYK9-1999: the exhibitor's two entry emails, in the words her own email uses.
    case 'registration_confirmation':
      return 'Receipt';
    case 'heritage_confirmation':
      return 'Full confirmation';
    case 'show_reminder':
      return 'Reminder';
    case 'entry_decision':
      return 'Entry decision';
    case 'waitlist_notification':
      return 'Waitlist notification';
    case 'registry_results_submission':
      return 'Results submission';
    case 'show_message':
      return 'Show message';
    case 'registry_deadline_reminder':
      return 'Results deadline reminder';
    default:
      return 'Email';
  }
}
