// Alerts Management Page

import React, { useState } from 'react';
import { Bell, Activity, TrendingUp, Settings } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import AlertDashboard from '../components/alerts/AlertDashboard';
import AlertRuleManager from '../components/alerts/AlertRuleManager';
import { useAlerts } from '../hooks/useAlerts';
import { AlertStatus } from '../types/alert-types';

const AlertsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  
  const {
    statistics,
    loading,
    error,
    isConnected,
    lastUpdate
  } = useAlerts({
    autoRefresh: true,
    refreshInterval: 30000
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-6 pt-20 pb-8 max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight flex items-center" 
                  style={{ fontWeight: 650 }}>
                <Bell className="mr-3 h-8 w-8 text-primary" />
                Alert Management
              </h1>
              <p className="text-muted-foreground mt-2" style={{ fontWeight: 400 }}>
                Monitor system health and manage alert notifications
              </p>
            </div>
            
            <div className="flex items-center space-x-4">
              {/* Connection Status */}
              <div className="flex items-center space-x-2">
                <div
                  className={`w-2 h-2 rounded-full ${
                    isConnected ? 'bg-green-500' : 'bg-red-500'
                  }`}
                />
                <span className="text-sm text-muted-foreground">
                  {isConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
              
              {/* Last Update */}
              {lastUpdate && (
                <span className="text-sm text-muted-foreground">
                  Last updated: {lastUpdate.toLocaleTimeString()}
                </span>
              )}
            </div>
          </div>
          
          {/* Premium Stats Cards */}
          {statistics && !loading && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-8">
              {/* Total Alerts Card */}
              <div className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 
                               border border-border rounded-2xl p-6 shadow-sm backdrop-blur-xl 
                               transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent 
                                 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="relative flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Total Alerts</p>
                    <p className="text-2xl font-bold mt-2 group-hover:text-primary transition-colors duration-300">
                      {statistics.total}
                    </p>
                  </div>
                  <div className="p-2 bg-gradient-to-br from-primary/20 to-primary/10 rounded-xl 
                                   shadow-sm group-hover:shadow-xl group-hover:scale-110 
                                   transition-all duration-300">
                    <Bell className="h-5 w-5 text-primary" />
                  </div>
                </div>
              </div>
              
              {/* Active Alerts Card */}
              <div className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 
                               border border-border rounded-2xl p-6 shadow-sm backdrop-blur-xl 
                               transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
                <div className="absolute inset-0 bg-gradient-to-br from-error-red/5 to-transparent 
                                 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="relative flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Active</p>
                    <p className="text-2xl font-bold mt-2 text-error-red group-hover:scale-105 transition-transform duration-300">
                      {statistics.byStatus[AlertStatus.ACTIVE] || 0}
                    </p>
                  </div>
                  <div className="p-2 bg-gradient-to-br from-error-red/20 to-error-red/10 rounded-xl 
                                   shadow-sm group-hover:shadow-xl group-hover:scale-110 
                                   transition-all duration-300">
                    <Activity className="h-5 w-5 text-error-red" />
                  </div>
                </div>
              </div>
              
              {/* Recent Alerts Card */}
              <div className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 
                               border border-border rounded-2xl p-6 shadow-sm backdrop-blur-xl 
                               transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent 
                                 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="relative flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Recent (24h)</p>
                    <p className="text-2xl font-bold mt-2 group-hover:text-primary transition-colors duration-300">
                      {statistics.recentAlerts.length}
                    </p>
                  </div>
                  <div className="p-2 bg-gradient-to-br from-primary/20 to-primary/10 rounded-xl 
                                   shadow-sm group-hover:shadow-xl group-hover:scale-110 
                                   transition-all duration-300">
                    <TrendingUp className="h-5 w-5 text-primary" />
                  </div>
                </div>
              </div>
              
              {/* Top Rule Card */}
              <div className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 
                               border border-border rounded-2xl p-6 shadow-sm backdrop-blur-xl 
                               transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent 
                                 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="relative flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Top Rule</p>
                    <p className="text-sm font-medium truncate mt-1 group-hover:text-primary transition-colors duration-300">
                      {statistics.topRules[0]?.name || 'None'}
                    </p>
                    <p className="text-lg font-bold group-hover:text-primary transition-colors duration-300">
                      {statistics.topRules[0]?.count || 0} alerts
                    </p>
                  </div>
                  <div className="p-2 bg-gradient-to-br from-primary/20 to-primary/10 rounded-xl 
                                   shadow-sm group-hover:shadow-xl group-hover:scale-110 
                                   transition-all duration-300">
                    <Settings className="h-5 w-5 text-primary" />
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {/* Error State */}
          {error && (
            <div className="mt-6 bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-800 text-sm">
                <strong>Error:</strong> {error}
              </p>
            </div>
          )}
        </div>

        {/* Main Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 bg-gradient-to-r from-muted/50 to-muted/30 
                               border border-border/30 rounded-xl p-1">
            <TabsTrigger 
              value="dashboard" 
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 
                         data-[state=active]:to-primary/5 data-[state=active]:text-primary 
                         data-[state=active]:shadow-sm rounded-lg transition-all duration-300 
                         flex items-center space-x-2">
              <Activity className="h-4 w-4" />
              <span>Alert Dashboard</span>
            </TabsTrigger>
            <TabsTrigger 
              value="rules" 
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 
                         data-[state=active]:to-primary/5 data-[state=active]:text-primary 
                         data-[state=active]:shadow-sm rounded-lg transition-all duration-300 
                         flex items-center space-x-2">
              <Settings className="h-4 w-4" />
              <span>Rule Management</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="space-y-6">
            <AlertDashboard />
          </TabsContent>

          <TabsContent value="rules" className="space-y-6">
            <AlertRuleManager />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default AlertsPage;