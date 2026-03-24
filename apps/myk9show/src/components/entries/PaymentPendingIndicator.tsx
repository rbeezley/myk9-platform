import React, { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  // CreditCard,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  // DollarSign,
  Timer,
  Loader2,
} from 'lucide-react';

export type PaymentStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'refunded'
  | 'cancelled';

interface PaymentPendingIndicatorProps {
  /** Current payment status */
  status: PaymentStatus;
  /** Entry ID for tracking */
  entryId?: string;
  /** Payment amount */
  amount?: number;
  /** Currency symbol */
  currency?: string;
  /** Show detailed information */
  showDetails?: boolean;
  /** Show amount */
  showAmount?: boolean;
  /** Compact view */
  compact?: boolean;
  /** Processing timeout in seconds */
  timeoutSeconds?: number;
  /** Last update timestamp */
  lastUpdated?: Date;
  /** Custom className */
  className?: string;
  /** Callback for retry payment */
  onRetryPayment?: () => void;
  /** Callback for cancel payment */
  onCancelPayment?: () => void;
  /** Callback when timeout occurs */
  onTimeout?: () => void;
}

/**
 * PaymentPendingIndicator - Visual indicator for payment processing status with Premium design
 *
 * Displays payment status with appropriate colors, icons, and optional actions.
 * Includes timeout handling and real-time status updates.
 */
export const PaymentPendingIndicator: React.FC<PaymentPendingIndicatorProps> = ({
  status,
  entryId,
  amount,
  currency = '$',
  showDetails = false,
  showAmount = false,
  compact = false,
  timeoutSeconds = 300, // 5 minutes default
  lastUpdated,
  className = '',
  onRetryPayment,
  onCancelPayment,
  onTimeout,
}) => {
  const [timeRemaining, setTimeRemaining] = useState<number>(timeoutSeconds);
  const [hasTimedOut, setHasTimedOut] = useState(false);

  // Timer for processing timeout
  useEffect(() => {
    if (status !== 'processing') {
      return;
    }

    const startTime = lastUpdated ? lastUpdated.getTime() : Date.now();
    const timeoutMs = timeoutSeconds * 1000;

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, Math.ceil((timeoutMs - elapsed) / 1000));

      setTimeRemaining(remaining);

      if (remaining === 0 && !hasTimedOut) {
        setHasTimedOut(true);
        onTimeout?.();
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [status, timeoutSeconds, lastUpdated, hasTimedOut, onTimeout]);

  // Status configuration with design tokens
  const statusConfig = {
    pending: {
      icon: Clock,
      label: 'Payment Pending',
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
      borderColor: 'border-orange-200',
      badgeVariant: 'secondary' as const,
      description: 'Awaiting payment confirmation',
      showProgress: false,
      animate: false,
    },
    processing: {
      icon: Loader2,
      label: 'Processing Payment',
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
      badgeVariant: 'secondary' as const,
      description: 'Payment is being processed',
      showProgress: true,
      animate: true,
    },
    completed: {
      icon: CheckCircle,
      label: 'Payment Complete',
      color: 'text-green-600',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200',
      badgeVariant: 'default' as const,
      description: 'Payment successfully processed',
      showProgress: false,
      animate: false,
    },
    failed: {
      icon: XCircle,
      label: 'Payment Failed',
      color: 'text-red-600',
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200',
      badgeVariant: 'destructive' as const,
      description: 'Payment processing failed',
      showProgress: false,
      animate: false,
    },
    refunded: {
      icon: RefreshCw,
      label: 'Payment Refunded',
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
      borderColor: 'border-purple-200',
      badgeVariant: 'secondary' as const,
      description: 'Payment has been refunded',
      showProgress: false,
      animate: false,
    },
    cancelled: {
      icon: XCircle,
      label: 'Payment Cancelled',
      color: 'text-gray-600',
      bgColor: 'bg-gray-50',
      borderColor: 'border-gray-200',
      badgeVariant: 'secondary' as const,
      description: 'Payment was cancelled',
      showProgress: false,
      animate: false,
    },
  };

  const config = statusConfig[status];
  const IconComponent = config.icon;

  // Calculate progress for processing status
  const progress =
    status === 'processing' && timeoutSeconds > 0
      ? Math.max(0, ((timeoutSeconds - timeRemaining) / timeoutSeconds) * 100)
      : 0;

  // Format amount
  const formatAmount = (amount: number): string => {
    return `${currency}${amount.toFixed(2)}`;
  };

  // Format time remaining
  const formatTimeRemaining = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Compact view for limited space
  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={`inline-flex items-center gap-2 ${className}`}>
              <IconComponent
                className={`h-4 w-4 ${config.color} ${config.animate ? 'animate-spin' : ''}`}
                aria-label={`Payment status: ${config.label}`}
              />
              {showAmount && amount && (
                <span className="text-sm font-medium">{formatAmount(amount)}</span>
              )}
              {status === 'processing' && (
                <span className="text-xs text-muted-foreground">
                  {formatTimeRemaining(timeRemaining)}
                </span>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <IconComponent className={`h-4 w-4 ${config.color}`} />
                <span className="font-medium">{config.label}</span>
              </div>
              <p className="text-sm text-muted-foreground">{config.description}</p>
              {showAmount && amount && (
                <p className="text-sm font-medium">Amount: {formatAmount(amount)}</p>
              )}
              {entryId && <p className="text-xs text-muted-foreground">Entry: {entryId}</p>}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Full view with detailed information
  return (
    <div
      className={`space-y-3 p-4 ${config.bgColor} border ${config.borderColor} 
                     rounded-xl shadow-sm backdrop-blur-sm ${className}`}
    >
      {/* Header with icon and status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2 bg-card/80 rounded-lg border ${config.borderColor}`}>
            <IconComponent
              className={`h-5 w-5 ${config.color} ${config.animate ? 'animate-spin' : ''}`}
            />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-foreground">{config.label}</h4>
            <p className="text-xs text-muted-foreground">{config.description}</p>
          </div>
        </div>

        {/* Status badge */}
        <Badge
          variant={config.badgeVariant}
          className={`${config.bgColor} ${config.color} ${config.borderColor}`}
        >
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </Badge>
      </div>

      {/* Progress bar for processing status */}
      {config.showProgress && status === 'processing' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-foreground">Processing</span>
            <span className="text-xs text-muted-foreground">
              {formatTimeRemaining(timeRemaining)} remaining
            </span>
          </div>
          <Progress value={progress} className="h-2 bg-card/60" />
          {hasTimedOut && (
            <div className="flex items-center gap-2 text-orange-600">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-xs">Processing timeout reached</span>
            </div>
          )}
        </div>
      )}

      {/* Payment details */}
      {showDetails && (
        <div className="space-y-2 pt-2 border-t border-white/40">
          {amount && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Amount:</span>
              <span className="text-sm font-semibold text-foreground">{formatAmount(amount)}</span>
            </div>
          )}
          {entryId && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Entry ID:</span>
              <span className="text-xs font-mono text-foreground">{entryId}</span>
            </div>
          )}
          {lastUpdated && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Last Updated:</span>
              <span className="text-xs text-foreground">{lastUpdated.toLocaleTimeString()}</span>
            </div>
          )}
        </div>
      )}

      {/* Action buttons */}
      {(status === 'failed' || status === 'cancelled' || hasTimedOut) && (
        <div className="flex items-center gap-2 pt-2 border-t border-white/40">
          {onRetryPayment && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRetryPayment}
              className="flex-1 text-blue-600 border-blue-200 hover:bg-blue-50"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry Payment
            </Button>
          )}
          {onCancelPayment && status === 'processing' && (
            <Button
              variant="outline"
              size="sm"
              onClick={onCancelPayment}
              className="flex-1 text-red-600 border-red-200 hover:bg-red-50"
            >
              Cancel
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

// Convenience components for common use cases
export const EntryPaymentIndicator: React.FC<
  Omit<PaymentPendingIndicatorProps, 'entryId'> & { entryId: string }
> = props => <PaymentPendingIndicator {...props} />;

export const PaymentQueueIndicator: React.FC<
  PaymentPendingIndicatorProps & { queuePosition?: number }
> = ({ queuePosition, ...props }) => (
  <div className="space-y-2">
    <PaymentPendingIndicator {...props} />
    {queuePosition && queuePosition > 1 && (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Timer className="h-3 w-3" />
        <span>Position {queuePosition} in queue</span>
      </div>
    )}
  </div>
);

export default PaymentPendingIndicator;
