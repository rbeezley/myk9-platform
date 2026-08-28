import { CheckCircle, Clock, AlertTriangle } from 'lucide-react';

interface EmailStatusIconProps {
  status: string | undefined;
  errorMessage?: string | undefined;
  onResend?: (() => void) | undefined;
  resendDisabled?: boolean | undefined;
}

export function EmailStatusIcon({
  status,
  errorMessage,
  onResend,
  resendDisabled,
}: EmailStatusIconProps) {
  if (!status) return null;

  /**
   * Delivery status used to be carried by icon colour plus a `title`, and
   * nothing else. Two problems, both measured against `--card: #ffffff`:
   * `text-green-500` scored 2.04:1 and `text-yellow-500` 1.92:1, under WCAG
   * 1.4.11's 3:1 floor for non-text; and `title` is not reliably announced by
   * assistive tech, so the status was invisible to it. The semantic tokens pass
   * in both themes (light 8.6:1 / 8.0:1, dark ~10:1 / ~11:1), and the sr-only
   * text means the state no longer depends on colour at all.
   */
  const iconElement = (() => {
    switch (status) {
      case 'delivered':
        return (
          <span title="Email delivered">
            <CheckCircle className="h-4 w-4 text-success" aria-hidden />
            <span className="sr-only">Email delivered</span>
          </span>
        );
      case 'sent':
        return (
          <span title="Email sent, awaiting delivery">
            <Clock className="h-4 w-4 text-warning" aria-hidden />
            <span className="sr-only">Email sent, awaiting delivery</span>
          </span>
        );
      case 'bounced':
        return (
          <span title={`Email bounced${errorMessage ? `: ${errorMessage}` : ''}`}>
            <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden />
            <span className="sr-only">Email bounced{errorMessage ? `: ${errorMessage}` : ''}</span>
          </span>
        );
      case 'failed':
        return (
          <span title={`Email failed${errorMessage ? `: ${errorMessage}` : ''}`}>
            <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden />
            <span className="sr-only">Email failed{errorMessage ? `: ${errorMessage}` : ''}</span>
          </span>
        );
      case 'complained':
        return (
          <span title="Recipient marked as spam">
            <AlertTriangle className="h-4 w-4 text-warning" aria-hidden />
            <span className="sr-only">Recipient marked as spam</span>
          </span>
        );
      default:
        return null;
    }
  })();

  if (!iconElement) return null;

  return (
    <span className="inline-flex items-center gap-1">
      {iconElement}
      {onResend && (status === 'bounced' || status === 'failed') && (
        <button
          type="button"
          onClick={onResend}
          disabled={resendDisabled}
          className="text-xs text-primary hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Resend
        </button>
      )}
    </span>
  );
}
