// Alert System Initializer Component

import React, { useEffect, useCallback } from 'react';
import AlertingService from '../../services/alerts/AlertingService';
import { AlertToastContainer } from './AlertToast';
import { useAlertNotifications } from '../../hooks/useAlerts';
import { logger } from '@/services/LoggingService';

// Track initialization to prevent duplicate runs in StrictMode
let hasInitializedAlerts = false;

interface AlertInitializerProps {
  children: React.ReactNode;
}

export const AlertInitializer: React.FC<AlertInitializerProps> = ({ children }) => {
  const {
    toastAlerts,
    dismissToast,
    markAsRead,
    requestPermission
  } = useAlertNotifications({
    maxToasts: 5,
    autoHideDuration: 8000
  });

  // Memoize requestPermission to prevent dependency changes
  const stableRequestPermission = useCallback(() => requestPermission(), [requestPermission]);

  useEffect(() => {
    // Guard against duplicate initialization in StrictMode
    if (hasInitializedAlerts) return;
    hasInitializedAlerts = true;

    const initializeAlerts = async () => {
      try {
        const alertingService = AlertingService.getInstance();
        await alertingService.initialize();

        // Request browser notification permission - defer to avoid blocking
        setTimeout(() => stableRequestPermission(), 500);

        logger.debug('[AlertInitializer] Alert system initialized', 'alerts', {});
      } catch (error) {
        logger.error('[AlertInitializer] Failed to initialize alert system:', 'alerts', {}, error as Error);
      }
    };

    // Defer initialization to not block render
    const timeoutId = setTimeout(initializeAlerts, 200);
    return () => clearTimeout(timeoutId);
  }, [stableRequestPermission]);

  const handleAcknowledgeAlert = async (alertId: string) => {
    try {
      const alertingService = AlertingService.getInstance();
      await alertingService.acknowledgeAlert(alertId);
      markAsRead(alertId);
    } catch (error) {
      logger.error('[AlertInitializer] Failed to acknowledge alert:', 'alerts', {}, error as Error);
    }
  };

  const handleResolveAlert = async (alertId: string) => {
    try {
      const alertingService = AlertingService.getInstance();
      await alertingService.resolveAlert(alertId);
      dismissToast(alertId);
    } catch (error) {
      logger.error('[AlertInitializer] Failed to resolve alert:', 'alerts', {}, error as Error);
    }
  };

  return (
    <>
      {children}
      <AlertToastContainer
        alerts={toastAlerts}
        onDismiss={dismissToast}
        onAcknowledge={handleAcknowledgeAlert}
        onResolve={handleResolveAlert}
        maxToasts={5}
        position="top-right"
      />
    </>
  );
};

export default AlertInitializer;