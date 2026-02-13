import { useCallback } from 'react';
import { toast } from 'sonner';
import { type StructuredError, ErrorClassifier } from '@/lib/errorMonitoring';
import { useOfflineFirst } from '@/lib/offlineHandler';

export function useUserFriendlyErrors() {
  const { networkStatus } = useOfflineFirst();

  const showError = useCallback(
    (
      error: Error | StructuredError,
      options: {
        showToast?: boolean;
        duration?: number;
        showRecovery?: boolean;
      } = {}
    ) => {
      const { showToast = true, duration = 5000, showRecovery = true } = options;

      const structuredError: StructuredError =
        'severity' in error
          ? (error as StructuredError)
          : {
              id: `error_${Date.now()}`,
              message: error.message,
              ...(error.stack !== undefined && { stack: error.stack }),
              context: {
                sessionId: 'current',
                userAgent: navigator.userAgent,
                url: window.location.href,
                timestamp: Date.now(),
              },
              ...ErrorClassifier.classifyError(error),
            };

      if (showToast) {
        const isHighSeverity =
          structuredError.severity === 'critical' || structuredError.severity === 'high';

        const title = (() => {
          switch (structuredError.category) {
            case 'network':
              return 'Connection Error';
            case 'validation':
              return 'Validation Error';
            case 'authentication':
              return 'Authentication Error';
            case 'authorization':
              return 'Permission Error';
            default:
              return 'Error';
          }
        })();

        const toastOptions = {
          description: structuredError.resolution?.suggested || structuredError.message,
          duration,
          action:
            showRecovery && structuredError.retryable
              ? {
                  label: 'Retry',
                  onClick: () => {
                    window.location.reload();
                  },
                }
              : undefined,
        };

        if (isHighSeverity) {
          toast.error(title, toastOptions);
        } else {
          toast(title, toastOptions);
        }
      }

      return structuredError;
    },
    []
  );

  const showSuccess = useCallback(
    (message: string, description?: string, duration = 3000) => {
      toast.success(message, {
        description,
        duration,
      });
    },
    []
  );

  const showOfflineNotice = useCallback(() => {
    if (!networkStatus.isOnline) {
      toast.error('You are offline', {
        description:
          'Your changes will be saved and synced when connection is restored.',
        duration: 8000,
      });
    }
  }, [networkStatus.isOnline]);

  return {
    showError,
    showSuccess,
    showOfflineNotice,
    isOnline: networkStatus.isOnline,
  };
}
