import { toast } from 'sonner';
import { CheckCircle, XCircle, AlertCircle, Info, Loader2 } from 'lucide-react';

/** Duration tiers (ms) — consistent across the app */
export const TOAST_DURATIONS = {
  success: 4000,
  info: 4000,
  warning: 5000,
  error: 6000,
  undo: 8000,
} as const;

export interface NotificationOptions {
  title?: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  duration?: number;
}

export const notifications = {
  success: (message: string, options?: NotificationOptions) => {
    return toast.success(message, {
      description: options?.description,
      duration: options?.duration || TOAST_DURATIONS.success,
      action: options?.action
        ? {
            label: options.action.label,
            onClick: options.action.onClick,
          }
        : undefined,
      icon: <CheckCircle />,
    });
  },

  error: (message: string, options?: NotificationOptions) => {
    return toast.error(message, {
      description: options?.description,
      duration: options?.duration || TOAST_DURATIONS.error,
      action: options?.action
        ? {
            label: options.action.label,
            onClick: options.action.onClick,
          }
        : undefined,
      icon: <XCircle />,
    });
  },

  warning: (message: string, options?: NotificationOptions) => {
    return toast.warning(message, {
      description: options?.description,
      duration: options?.duration || TOAST_DURATIONS.warning,
      action: options?.action
        ? {
            label: options.action.label,
            onClick: options.action.onClick,
          }
        : undefined,
      icon: <AlertCircle />,
    });
  },

  info: (message: string, options?: NotificationOptions) => {
    return toast.info(message, {
      description: options?.description,
      duration: options?.duration || TOAST_DURATIONS.info,
      action: options?.action
        ? {
            label: options.action.label,
            onClick: options.action.onClick,
          }
        : undefined,
      icon: <Info />,
    });
  },

  loading: (message: string, options?: Omit<NotificationOptions, 'action'>) => {
    return toast.loading(message, {
      description: options?.description,
      icon: <Loader2 />,
    });
  },

  promise: <T,>(
    promise: Promise<T>,
    messages: {
      loading: string;
      success: string | ((result: T) => string);
      error: string | ((error: unknown) => string);
    }
  ) => {
    return toast.promise(promise, {
      loading: messages.loading,
      success: result =>
        typeof messages.success === 'function' ? messages.success(result) : messages.success,
      error: error =>
        typeof messages.error === 'function' ? messages.error(error) : messages.error,
    });
  },

  dismiss: () => {
    toast.dismiss();
  },

  dismissById: (id: string | number) => {
    toast.dismiss(id);
  },
};

// Predefined notification templates for common actions
export const actionNotifications = {
  created: (entityType: string, entityName?: string) => {
    const name = entityName ? ` "${entityName}"` : '';
    return notifications.success(`${entityType}${name} created successfully`);
  },

  updated: (entityType: string, entityName?: string) => {
    const name = entityName ? ` "${entityName}"` : '';
    return notifications.success(`${entityType}${name} updated successfully`);
  },

  /** Show deletion toast with undo action. Caller must provide the undo callback. */
  deleted: (entityType: string, entityName?: string, onUndo?: () => void) => {
    const name = entityName ? ` "${entityName}"` : '';
    const opts: NotificationOptions = { duration: TOAST_DURATIONS.undo };
    if (onUndo) opts.action = { label: 'Undo', onClick: onUndo };
    return notifications.success(`${entityType}${name} deleted`, opts);
  },

  saveInProgress: (entityType: string) => {
    return notifications.loading(`Saving ${entityType.toLowerCase()}...`);
  },

  uploadInProgress: (fileName?: string) => {
    const file = fileName ? ` "${fileName}"` : '';
    return notifications.loading(`Uploading${file}...`);
  },

  validationError: (message: string) => {
    return notifications.error('Validation Error', {
      description: message,
    });
  },

  networkError: (action?: string, onRetry?: () => void) => {
    const actionText = action ? ` ${action}` : '';
    const opts: NotificationOptions = {
      description: `Failed to${actionText}. Please check your connection and try again.`,
    };
    if (onRetry) opts.action = { label: 'Retry', onClick: onRetry };
    return notifications.error('Network Error', opts);
  },

  permissionError: (action: string) => {
    return notifications.error('Permission Denied', {
      description: `You don't have permission to ${action}.`,
    });
  },

  syncSuccess: () => {
    return notifications.success('Data synchronized successfully');
  },

  syncError: (onRetry?: () => void) => {
    const opts: NotificationOptions = {
      description: 'Some changes may not be saved. Please try again.',
    };
    if (onRetry) opts.action = { label: 'Retry Sync', onClick: onRetry };
    return notifications.error('Failed to sync data', opts);
  },

  bulkAction: (action: string, count: number, entityType: string) => {
    return notifications.success(
      `${action} ${count} ${entityType}${count === 1 ? '' : 's'} successfully`
    );
  },

  exportSuccess: (fileName: string) => {
    return notifications.success('Export completed', {
      description: `File "${fileName}" has been downloaded.`,
    });
  },

  importSuccess: (count: number, entityType: string) => {
    return notifications.success(
      `Imported ${count} ${entityType}${count === 1 ? '' : 's'} successfully`
    );
  },

  importError: (errorCount: number) => {
    return notifications.error('Import completed with errors', {
      description: `${errorCount} items failed to import. Please check the format and try again.`,
    });
  },
};
