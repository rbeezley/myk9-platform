import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, HelpCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ViewEmailButton } from './EmailContentDialog';
import {
  getEmailDeliveryStatusPresentation,
  getExhibitorEmailAdvice,
  type EmailDeliveryHistoryRow,
} from './readModel';

interface DeliveryHistoryRowProps {
  row: EmailDeliveryHistoryRow;
  /**
   * MYK9-2403: the same row inside one exhibitor's entry form. The address is the
   * exhibitor's own (stated once above the list), "Review this email" would link back to
   * the page the secretary is on, and a failed email says what to do about it.
   */
  forExhibitor?: boolean;
  /** Extra actions beside "View email", such as a resend where one is already allowed. */
  actions?: ReactNode;
}

export function DeliveryHistoryRow({ row, forExhibitor, actions }: DeliveryHistoryRowProps) {
  const presentation = getEmailDeliveryStatusPresentation(row.status);
  const needsAttention = ['bounced', 'failed', 'complained'].includes(row.status);

  return (
    <article className="rounded-md border p-3" role="listitem" data-testid="delivery-history-row">
      <div className="flex items-start gap-3">
        <StatusIcon status={presentation.kind} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h3 className="font-medium">{row.typeLabel}</h3>
            <time className="text-sm text-muted-foreground" dateTime={row.relevantAt}>
              {formatAttemptTime(row.relevantAt)}
            </time>
          </div>
          {forExhibitor ? null : <p className="mt-1 break-words text-sm">{row.recipient}</p>}
          <p className="mt-1 text-sm font-medium">{row.statusLabel}</p>
          {needsAttention ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {forExhibitor
                ? getExhibitorEmailAdvice(row.status)
                : (row.failureSummary ?? presentation.description)}
            </p>
          ) : null}
          {!forExhibitor && needsAttention && row.recoveryHref ? (
            <Link
              to={row.recoveryHref}
              className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Review this email
            </Link>
          ) : null}
          <div className="flex flex-wrap items-center gap-x-4">
            <ViewEmailButton emailLogId={row.id} label={row.typeLabel} />
            {actions}
          </div>
        </div>
      </div>
    </article>
  );
}

function StatusIcon({ status }: { status: EmailDeliveryHistoryRow['status'] }) {
  const Icon =
    status === 'delivered'
      ? CheckCircle2
      : status === 'sent'
        ? Clock3
        : status === 'unavailable'
          ? HelpCircle
          : AlertTriangle;
  return <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />;
}

function formatAttemptTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Time unavailable';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}
