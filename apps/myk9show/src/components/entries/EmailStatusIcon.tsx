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

  const iconElement = (() => {
    switch (status) {
      case 'delivered':
        return (
          <span title="Email delivered">
            <CheckCircle className="h-4 w-4 text-green-500" />
          </span>
        );
      case 'sent':
        return (
          <span title="Email sent, awaiting delivery">
            <Clock className="h-4 w-4 text-yellow-500" />
          </span>
        );
      case 'bounced':
        return (
          <span title={`Email bounced${errorMessage ? `: ${errorMessage}` : ''}`}>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </span>
        );
      case 'failed':
        return (
          <span title={`Email failed${errorMessage ? `: ${errorMessage}` : ''}`}>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </span>
        );
      case 'complained':
        return (
          <span title="Recipient marked as spam">
            <AlertTriangle className="h-4 w-4 text-orange-500" />
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
