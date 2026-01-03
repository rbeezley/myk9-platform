import React from 'react';
import { ComprehensiveSyncDashboard } from '@/components/sync/overview/ComprehensiveSyncDashboard';
import { useAuth } from '@/hooks/useAuth';
import { Navigate } from 'react-router-dom';

export const SyncDashboardPage: React.FC = () => {
  const { user } = useAuth();
  const isAuthenticated = !!user;

  // Redirect if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Check if user has access to sync dashboard
  const hasAccess = user?.role === 'admin' || user?.role === 'secretary' || user?.role === 'judge';
  
  if (!hasAccess) {
    return <Navigate to="/dashboard" replace />;
  }

  return <ComprehensiveSyncDashboard />;
};