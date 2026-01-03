// Alert System Initializer Component

import React, { useEffect } from 'react';
import AlertingService from '../../services/alerts/AlertingService';
import { AlertToastContainer } from './AlertToast';
import { useAlertNotifications } from '../../hooks/useAlerts';

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

  useEffect(() => {
    const initializeAlerts = async () => {
      try {
        const alertingService = AlertingService.getInstance();
        await alertingService.initialize();
        
        // Request browser notification permission
        await requestPermission();
        
        console.log('[AlertInitializer] Alert system initialized');
      } catch (error) {
        console.error('[AlertInitializer] Failed to initialize alert system:', error);
      }
    };

    initializeAlerts();
  }, [requestPermission]);

  const handleAcknowledgeAlert = async (alertId: string) => {
    try {
      const alertingService = AlertingService.getInstance();
      await alertingService.acknowledgeAlert(alertId);
      markAsRead(alertId);
    } catch (error) {
      console.error('[AlertInitializer] Failed to acknowledge alert:', error);
    }
  };

  const handleResolveAlert = async (alertId: string) => {
    try {
      const alertingService = AlertingService.getInstance();
      await alertingService.resolveAlert(alertId);
      dismissToast(alertId);
    } catch (error) {
      console.error('[AlertInitializer] Failed to resolve alert:', error);
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