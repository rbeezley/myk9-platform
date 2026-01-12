/**
 * Permission Audit Log Page
 * Phase 3.5: View audit trail of permission changes
 * Created: December 2024
 */

import React, { useState, useEffect, useCallback } from 'react';
import { logger } from '@/services/LoggingService';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  History, 
  Search, 
  Filter,
  Calendar,
  User,
  Shield,
  Settings,
  Download,
  RefreshCw
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { rbacService } from '@/services/rbac/RBACService';
import { PermissionAuditLog } from '@/types/rbac-types';
import { formatDistanceToNow } from 'date-fns';

const PermissionAuditPage: React.FC = () => {
  const [auditLogs, setAuditLogs] = useState<PermissionAuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<string>('7d');

  const loadAuditLogs = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Calculate date range
      const now = new Date();
      const daysBack = dateRange === '1d' ? 1 : 
                      dateRange === '7d' ? 7 : 
                      dateRange === '30d' ? 30 : 
                      dateRange === '90d' ? 90 : 7;
      
      const fromDate = new Date(now.getTime() - (daysBack * 24 * 60 * 60 * 1000));
      
      const logs = await rbacService.getAuditLogs({
        fromDate: fromDate.toISOString(),
        toDate: now.toISOString(),
        limit: 1000
      });
      
      setAuditLogs(logs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit logs');
    } finally {
      setIsLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    loadAuditLogs();
  }, [loadAuditLogs]);

  const handleExport = async () => {
    try {
      // This would implement CSV export functionality
      alert('Export functionality would be implemented here');
    } catch {
      alert('Failed to export audit logs');
    }
  };

  // Filter audit logs
  const filteredLogs = auditLogs.filter(log => {
    const matchesSearch = searchTerm === '' || 
      (log.actor_email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.target_role_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.target_permission_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.target_user_email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.action_type.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesAction = actionFilter === 'all' || log.action_type === actionFilter;
    
    return matchesSearch && matchesAction;
  });

  // Get unique action types for filter
  const actionTypes = [...new Set(auditLogs.map(log => log.action_type))].sort();

  // Group logs by date
  const logsByDate = filteredLogs.reduce((acc, log) => {
    const date = new Date(log.created_at).toDateString();
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(log);
    return acc;
  }, {} as Record<string, PermissionAuditLog[]>);

  const getActionIcon = (actionType: string) => {
    switch (actionType) {
      case 'assign_role':
      case 'create_role':
        return <Shield className="h-4 w-4 text-green-600" />;
      case 'revoke_role':
      case 'delete_role':
        return <Shield className="h-4 w-4 text-red-600" />;
      case 'grant_permission':
        return <Settings className="h-4 w-4 text-blue-600" />;
      case 'revoke_permission':
        return <Settings className="h-4 w-4 text-orange-600" />;
      default:
        return <History className="h-4 w-4 text-gray-600" />;
    }
  };

  const getActionBadge = (actionType: string) => {
    const variants = {
      'assign_role': 'default',
      'revoke_role': 'destructive',
      'grant_permission': 'default',
      'revoke_permission': 'secondary',
      'create_role': 'default',
      'delete_role': 'destructive',
      'update_role': 'secondary'
    } as const;

    return (
      <Badge variant={variants[actionType as keyof typeof variants] || 'outline'}>
        {actionType.replace('_', ' ').toUpperCase()}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-6 pt-20 pb-8 max-w-7xl">
          <div className="space-y-8">
            {/* Header Skeleton */}
            <div className="space-y-3">
              <div className="h-8 bg-muted rounded-lg w-64 animate-pulse" />
              <div className="h-4 bg-muted rounded w-96 animate-pulse" />
            </div>
            
            {/* Stats Cards Skeleton */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="p-6 rounded-2xl border bg-card">
                  <div className="space-y-3">
                    <div className="h-4 bg-muted rounded w-24 animate-pulse" />
                    <div className="h-8 bg-muted rounded w-16 animate-pulse" />
                    <div className="h-3 bg-muted rounded w-20 animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
            
            {/* Content Skeleton */}
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="p-6 rounded-2xl border bg-card">
                  <div className="space-y-3">
                    <div className="h-5 bg-muted rounded w-48 animate-pulse" />
                    <div className="h-4 bg-muted rounded animate-pulse" />
                    <div className="h-4 bg-muted rounded w-3/4 animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-6 pt-20 pb-8 max-w-7xl">
        <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <History className="h-8 w-8 text-primary" />
            Permission Audit Log
          </h1>
          <p className="text-muted-foreground mt-2">
            Track all permission and role changes in the system
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => loadAuditLogs()} 
                  className="border-primary/20 text-primary hover:bg-primary/5 hover:border-primary/40 
                           hover:-translate-y-0.5 transition-all duration-300 shadow-sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={handleExport}
                  className="bg-gradient-to-r from-primary to-secondary text-primary-foreground 
                           hover:shadow-xl hover:-translate-y-1 hover:scale-[1.02] 
                           transition-all duration-300 shadow-sm">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 
                         border border-border rounded-2xl p-6 shadow-sm backdrop-blur-xl 
                         transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent 
                           opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative flex items-start justify-between">
            <div className="flex-1">
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Total Events
              </p>
              <p className="text-2xl font-bold mt-2 group-hover:text-primary transition-colors duration-300">
                {auditLogs.length}
              </p>
            </div>
            <div className="p-2 bg-gradient-to-br from-primary/20 to-primary/10 rounded-xl 
                             shadow-sm group-hover:shadow-xl group-hover:scale-110 
                             transition-all duration-300">
              <History className="h-5 w-5 text-primary" />
            </div>
          </div>
        </Card>
        
        <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 
                         border border-border rounded-2xl p-6 shadow-sm backdrop-blur-xl 
                         transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent 
                           opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative flex items-start justify-between">
            <div className="flex-1">
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Role Changes
              </p>
              <p className="text-2xl font-bold mt-2 group-hover:text-primary transition-colors duration-300">
                {auditLogs.filter(log => log.action_type.includes('role')).length}
              </p>
            </div>
            <div className="p-2 bg-gradient-to-br from-green-500/20 to-green-500/10 rounded-xl 
                             shadow-sm group-hover:shadow-xl group-hover:scale-110 
                             transition-all duration-300">
              <Shield className="h-5 w-5 text-green-500" />
            </div>
          </div>
        </Card>
        
        <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 
                         border border-border rounded-2xl p-6 shadow-sm backdrop-blur-xl 
                         transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent 
                           opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative flex items-start justify-between">
            <div className="flex-1">
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Permission Changes
              </p>
              <p className="text-2xl font-bold mt-2 group-hover:text-primary transition-colors duration-300">
                {auditLogs.filter(log => log.action_type.includes('permission')).length}
              </p>
            </div>
            <div className="p-2 bg-gradient-to-br from-purple-500/20 to-purple-500/10 rounded-xl 
                             shadow-sm group-hover:shadow-xl group-hover:scale-110 
                             transition-all duration-300">
              <Settings className="h-5 w-5 text-purple-500" />
            </div>
          </div>
        </Card>
        
        <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 
                         border border-border rounded-2xl p-6 shadow-sm backdrop-blur-xl 
                         transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent 
                           opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative flex items-start justify-between">
            <div className="flex-1">
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Unique Users
              </p>
              <p className="text-2xl font-bold mt-2 group-hover:text-primary transition-colors duration-300">
                {new Set(auditLogs.map(log => log.actor_id)).size}
              </p>
            </div>
            <div className="p-2 bg-gradient-to-br from-orange-500/20 to-orange-500/10 rounded-xl 
                             shadow-sm group-hover:shadow-xl group-hover:scale-110 
                             transition-all duration-300">
              <User className="h-5 w-5 text-orange-500" />
            </div>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 
                       border border-border rounded-2xl shadow-sm backdrop-blur-xl 
                       transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent 
                         opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        <CardContent className="relative p-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search by user, role, permission, or action..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-background border-border/50 focus:border-primary focus:ring-2 
                           focus:ring-primary/20 rounded-lg transition-all duration-300"
              />
            </div>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-full md:w-48 bg-background border-border/50 
                                       focus:border-primary transition-all duration-300">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filter by action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                {actionTypes.map(actionType => (
                  <SelectItem key={actionType} value={actionType}>
                    {actionType.replace('_', ' ').toUpperCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-full md:w-48 bg-background border-border/50 
                                       focus:border-primary transition-all duration-300">
                <Calendar className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1d">Last 24 hours</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Audit Log Table */}
      <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 
                       border border-border rounded-2xl shadow-sm backdrop-blur-xl 
                       transition-all duration-500 hover:shadow-xl hover:-translate-y-2">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent 
                         opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        <CardHeader className="relative">
          <CardTitle className="group-hover:text-primary transition-colors duration-300">
            Audit Events
          </CardTitle>
          <CardDescription>
            {filteredLogs.length} of {auditLogs.length} events shown
          </CardDescription>
        </CardHeader>
        <CardContent className="relative">
          {Object.keys(logsByDate).length > 0 ? (
            <div className="space-y-6">
              {Object.entries(logsByDate)
                .sort(([a], [b]) => new Date(b).getTime() - new Date(a).getTime())
                .map(([date, logs]) => (
                  <div key={date}>
                    <h3 className="font-medium text-sm text-muted-foreground mb-3 sticky top-0 bg-background">
                      {date} ({logs.length} events)
                    </h3>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Action</TableHead>
                          <TableHead>Actor</TableHead>
                          <TableHead>Target</TableHead>
                          <TableHead>Details</TableHead>
                          <TableHead>Time</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {logs
                          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                          .map((log) => (
                            <TableRow key={log.id}>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  {getActionIcon(log.action_type)}
                                  {getActionBadge(log.action_type)}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div>
                                  <div className="font-medium">
                                    {log.actor_email || 'System'}
                                  </div>
                                  {log.actor_id && (
                                    <div className="text-xs text-muted-foreground font-mono">
                                      {log.actor_id}
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="space-y-1">
                                  {log.target_role_name && (
                                    <div className="text-sm">
                                      Role: <span className="font-medium">{log.target_role_name}</span>
                                    </div>
                                  )}
                                  {log.target_permission_name && (
                                    <div className="text-sm">
                                      Permission: <span className="font-medium">{log.target_permission_name}</span>
                                    </div>
                                  )}
                                  {log.target_user_email && (
                                    <div className="text-sm">
                                      User: <span className="font-medium">{log.target_user_email}</span>
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                {log.details && typeof log.details === 'object' && (
                                  <div className="text-xs">
                                    {Object.entries(log.details).map(([key, value]) => (
                                      <div key={key}>
                                        <span className="text-muted-foreground">{key}:</span> {String(value)}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="text-sm">
                                  {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {new Date(log.created_at).toLocaleTimeString()}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </div>
                ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <History className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No audit events found</h3>
              <p className="text-muted-foreground">
                {searchTerm || actionFilter !== 'all' 
                  ? 'No events match your current filters'
                  : 'No audit events in the selected time range'
                }
              </p>
            </div>
          )}
        </CardContent>
      </Card>
        </div>
      </div>
    </div>
  );
};

export default PermissionAuditPage;