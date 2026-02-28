import React from 'react';
import SyncMonitoringDashboard from '../../components/sync/SyncMonitoringDashboard';

/**
 * Sync Monitoring Page
 *
 * Main page for displaying the comprehensive sync monitoring dashboard.
 * Provides real-time metrics, analytics, and health monitoring for
 * sync operations across the application.
 */
const SyncMonitoringPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-6 pt-8 pb-8 max-w-7xl">
        <SyncMonitoringDashboard />
      </div>
    </div>
  );
};

export default SyncMonitoringPage;
