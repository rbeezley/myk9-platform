import React from 'react';
import { toast } from 'sonner';
import { CheckCircle, XCircle, AlertCircle, Info, Loader2 } from 'lucide-react';

export interface NotificationOptions {
  title?: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  duration?: number;
}

// Enhanced notification functions
export const notifications = {
  // Success notifications
  success: (message: string, options?: NotificationOptions) => {
    return toast.success(message, {
      description: options?.description,
      duration: options?.duration || 4000,
      action: options?.action
        ? {
            label: options.action.label,
            onClick: options.action.onClick,
          }
        : undefined,
      icon: React.createElement(CheckCircle),
    });
  },

  // Error notifications
  error: (message: string, options?: NotificationOptions) => {
    return toast.error(message, {
      description: options?.description,
      duration: options?.duration || 6000, // Longer for errors
      action: options?.action
        ? {
            label: options.action.label,
            onClick: options.action.onClick,
          }
        : undefined,
      icon: React.createElement(XCircle),
    });
  },

  // Warning notifications
  warning: (message: string, options?: NotificationOptions) => {
    return toast.warning(message, {
      description: options?.description,
      duration: options?.duration || 5000,
      action: options?.action
        ? {
            label: options.action.label,
            onClick: options.action.onClick,
          }
        : undefined,
      icon: React.createElement(AlertCircle),
    });
  },

  // Info notifications
  info: (message: string, options?: NotificationOptions) => {
    return toast.info(message, {
      description: options?.description,
      duration: options?.duration || 4000,
      action: options?.action
        ? {
            label: options.action.label,
            onClick: options.action.onClick,
          }
        : undefined,
      icon: React.createElement(Info),
    });
  },

  // Loading notifications
  loading: (message: string, options?: Omit<NotificationOptions, 'action'>) => {
    return toast.loading(message, {
      description: options?.description,
      icon: React.createElement(Loader2),
    });
  },

  // Promise-based notifications for async operations
  promise: <T>(
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

  // Dismiss all notifications
  dismiss: () => {
    toast.dismiss();
  },

  // Dismiss specific notification
  dismissById: (id: string | number) => {
    toast.dismiss(id);
  },
};

// Predefined notification templates for common actions
export const actionNotifications = {
  // CRUD operations
  created: (entityType: string, entityName?: string) => {
    const name = entityName ? ` "${entityName}"` : '';
    return notifications.success(`${entityType}${name} created successfully`);
  },

  updated: (entityType: string, entityName?: string) => {
    const name = entityName ? ` "${entityName}"` : '';
    return notifications.success(`${entityType}${name} updated successfully`);
  },

  deleted: (entityType: string, entityName?: string) => {
    const name = entityName ? ` "${entityName}"` : '';
    return notifications.success(`${entityType}${name} deleted successfully`, {
      action: {
        label: 'Undo',
        onClick: () => {
          // Undo logic would be implemented by the calling component
          notifications.info('Undo functionality not implemented yet');
        },
      },
    });
  },

  // Network operations
  saveInProgress: (entityType: string) => {
    return notifications.loading(`Saving ${entityType.toLowerCase()}...`);
  },

  uploadInProgress: (fileName?: string) => {
    const file = fileName ? ` "${fileName}"` : '';
    return notifications.loading(`Uploading${file}...`);
  },

  // Validation errors
  validationError: (message: string) => {
    return notifications.error('Validation Error', {
      description: message,
    });
  },

  // Network errors
  networkError: (action?: string) => {
    const actionText = action ? ` ${action}` : '';
    return notifications.error('Network Error', {
      description: `Failed to${actionText}. Please check your connection and try again.`,
      action: {
        label: 'Retry',
        onClick: () => {
          // Retry logic would be implemented by the calling component
          notifications.info('Retry functionality not implemented yet');
        },
      },
    });
  },

  // Permission errors
  permissionError: (action: string) => {
    return notifications.error('Permission Denied', {
      description: `You don't have permission to ${action}.`,
    });
  },

  // Data sync
  syncSuccess: () => {
    return notifications.success('Data synchronized successfully');
  },

  syncError: () => {
    return notifications.error('Failed to sync data', {
      description: 'Some changes may not be saved. Please try again.',
      action: {
        label: 'Retry Sync',
        onClick: () => {
          notifications.info('Sync retry not implemented yet');
        },
      },
    });
  },

  // Bulk operations
  bulkAction: (action: string, count: number, entityType: string) => {
    return notifications.success(
      `${action} ${count} ${entityType}${count === 1 ? '' : 's'} successfully`
    );
  },

  // Import/Export
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
