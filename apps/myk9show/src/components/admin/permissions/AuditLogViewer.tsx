/**
 * Comprehensive Audit Log Viewer Component
 * Phase 5: Security - Audit log viewer UI with export functionality
 * Created: December 2024
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { 
  FileText, 
  Download, 
  Filter,
  Calendar as CalendarIcon,
  Search,
  Eye,
  AlertTriangle,
  User,
  Clock,
  Activity,
  Shield,
  RefreshCw
} from 'lucide-react';
import { format, subDays, subWeeks } from 'date-fns';
import { auditService } from '@/services/AuditService';
import { rbacService } from '@/services/rbac/RBACService';
import { AuditSearchFilters, AuditEntry, AuditAction } from '@/types/audit-types';
import { AuditLogEntry } from '@/types/rbac-types';

interface AuditLogViewerProps {
  entityType?: string;
  entityId?: string;
  userId?: string;
  showFilters?: boolean;
  maxHeight?: string;
}

interface EnhancedAuditEntry extends AuditEntry {
  rbacDetails?: AuditLogEntry | undefined;
}

export const AuditLogViewer: React.FC<AuditLogViewerProps> = ({
  entityType,
  entityId,
  userId,
  showFilters = true,
  maxHeight = '600px'
}) => {
  const [auditEntries, setAuditEntries] = useState<EnhancedAuditEntry[]>([]);
  // const [rbacAuditEntries] = useState<AuditLogEntry[]>([]); // Commented out as not used
  const [selectedEntry, setSelectedEntry] = useState<EnhancedAuditEntry | null>(null);
  const [filters, setFilters] = useState<AuditSearchFilters>({
    entityType,
    entityId,
    userId,
    startDate: subWeeks(new Date(), 1), // Default to last week
    endDate: new Date(),
    page: 1,
    pageSize: 50
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: subWeeks(new Date(), 1),
    to: new Date()
  });

  const loadAuditData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Load general audit entries
      const auditResult = await auditService.searchAuditTrail(filters);
      
      // Load RBAC-specific audit entries
      const rbacEntries = await rbacService.getAuditLog({
        startDate: filters.startDate,
        endDate: filters.endDate,
        userId: filters.userId,
        entityType: filters.entityType,
        page: filters.page || 1,
        pageSize: filters.pageSize || 50
      });

      // Combine and enhance entries
      const enhancedEntries: EnhancedAuditEntry[] = auditResult.entries.map(entry => {
        const rbacDetail = rbacEntries.entries.find(rbac => 
          rbac.created_at && 
          Math.abs(new Date(rbac.created_at).getTime() - entry.timestamp.getTime()) < 5000 // 5 second window
        );
        
        return {
          ...entry,
          rbacDetails: rbacDetail
        };
      });

      // Add RBAC entries that don't have general audit counterparts
      rbacEntries.entries.forEach(rbacEntry => {
        const hasGeneralEntry = enhancedEntries.some(entry => 
          entry.rbacDetails?.id === rbacEntry.id
        );
        
        if (!hasGeneralEntry) {
          enhancedEntries.push({
            id: rbacEntry.id,
            timestamp: new Date(rbacEntry.created_at!),
            userId: rbacEntry.actor_id || undefined,
            action: mapRbacActionToAuditAction(rbacEntry.action_type),
            entityType: 'rbac_permission',
            entityId: rbacEntry.target_role_id || rbacEntry.target_permission_id || rbacEntry.target_user_id || 'unknown',
            rbacDetails: rbacEntry
          });
        }
      });

      // Sort by timestamp
      enhancedEntries.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      setAuditEntries(enhancedEntries);
      setTotalCount(auditResult.totalCount + (rbacEntries.totalCount || 0));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit data');
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadAuditData();
  }, [loadAuditData]);

  const mapRbacActionToAuditAction = (actionType: string): AuditAction => {
    if (actionType.includes('CREATE')) return AuditAction.CREATE;
    if (actionType.includes('UPDATE')) return AuditAction.UPDATE;
    if (actionType.includes('DELETE')) return AuditAction.DELETE;
    if (actionType.includes('ASSIGN') || actionType.includes('GRANT')) return AuditAction.CREATE;
    if (actionType.includes('REVOKE') || actionType.includes('REMOVE')) return AuditAction.DELETE;
    return AuditAction.SYSTEM_ACTION;
  };

  const handleFilterChange = (key: keyof AuditSearchFilters, value: unknown) => {
    setFilters(prev => ({ ...prev, [key]: value, page: 1 }));
  };

  const handleDateRangeChange = (range: { from: Date | undefined; to: Date | undefined }) => {
    setDateRange(range);
    setFilters(prev => ({
      ...prev,
      startDate: range.from,
      endDate: range.to,
      page: 1
    }));
  };

  const handleQuickDateFilter = (days: number) => {
    const to = new Date();
    const from = subDays(to, days);
    handleDateRangeChange({ from, to });
  };

  const exportAuditLog = async () => {
    try {
      setIsLoading(true);
      
      // Export with current filters but no pagination
      const exportData = await auditService.exportAuditTrail({
        ...filters,
        page: 1,
        pageSize: 10000 // Large number to get all entries
      });

      // Create blob and download
      const blob = new Blob([exportData], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-log-${format(new Date(), 'yyyy-MM-dd-HH-mm')}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export audit log');
    } finally {
      setIsLoading(false);
    }
  };

  const getActionBadge = (action: AuditAction) => {
    switch (action) {
      case AuditAction.CREATE:
        return <Badge variant="default" className="bg-green-100 text-green-700">Create</Badge>;
      case AuditAction.UPDATE:
        return <Badge variant="outline" className="border-yellow-500 text-yellow-700">Update</Badge>;
      case AuditAction.DELETE:
        return <Badge variant="destructive">Delete</Badge>;
      case AuditAction.LOGIN:
        return <Badge variant="secondary">Login</Badge>;
      case AuditAction.LOGOUT:
        return <Badge variant="outline">Logout</Badge>;
      case AuditAction.IMPERSONATE_START:
        return <Badge variant="outline" className="border-purple-500 text-purple-700">Impersonate Start</Badge>;
      case AuditAction.IMPERSONATE_END:
        return <Badge variant="outline" className="border-purple-300 text-purple-600">Impersonate End</Badge>;
      case AuditAction.EXPORT:
        return <Badge variant="outline" className="border-blue-500 text-blue-700">Export</Badge>;
      case AuditAction.IMPORT:
        return <Badge variant="outline" className="border-indigo-500 text-indigo-700">Import</Badge>;
      default:
        return <Badge variant="secondary">System</Badge>;
    }
  };

  const filteredEntries = auditEntries.filter(entry => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    return (
      entry.entityType.toLowerCase().includes(searchLower) ||
      entry.entityId.toLowerCase().includes(searchLower) ||
      entry.action.toLowerCase().includes(searchLower) ||
      (entry.userId && entry.userId.toLowerCase().includes(searchLower)) ||
      (entry.userRole && entry.userRole.toLowerCase().includes(searchLower))
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Audit Log Viewer
          </CardTitle>
          <CardDescription>
            Comprehensive audit trail for security monitoring and compliance
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="text-sm text-muted-foreground">
                Showing {filteredEntries.length} of {totalCount} entries
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={loadAuditData}
                disabled={isLoading}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
            <Button
              onClick={exportAuditLog}
              disabled={isLoading || filteredEntries.length === 0}
            >
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      {showFilters && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Search */}
              <div className="space-y-2">
                <Label>Search</Label>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search entries..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>

              {/* Action Filter */}
              <div className="space-y-2">
                <Label>Action</Label>
                <Select value={filters.action || ''} onValueChange={(value) => 
                  handleFilterChange('action', value || undefined)
                }>
                  <SelectTrigger>
                    <SelectValue placeholder="All actions" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All Actions</SelectItem>
                    {Object.values(AuditAction).map(action => (
                      <SelectItem key={action} value={action}>
                        {action.charAt(0).toUpperCase() + action.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Entity Type Filter */}
              <div className="space-y-2">
                <Label>Entity Type</Label>
                <Input
                  placeholder="e.g. role, user, permission"
                  value={filters.entityType || ''}
                  onChange={(e) => handleFilterChange('entityType', e.target.value || undefined)}
                />
              </div>

              {/* User ID Filter */}
              <div className="space-y-2">
                <Label>User ID</Label>
                <Input
                  placeholder="Filter by user ID"
                  value={filters.userId || ''}
                  onChange={(e) => handleFilterChange('userId', e.target.value || undefined)}
                />
              </div>
            </div>

            {/* Date Range Filters */}
            <div className="flex items-center gap-4">
              <div className="space-y-2">
                <Label>Date Range</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-auto">
                      <CalendarIcon className="h-4 w-4 mr-2" />
                      {dateRange.from && dateRange.to
                        ? `${format(dateRange.from, 'MMM d')} - ${format(dateRange.to, 'MMM d')}`
                        : 'Select date range'
                      }
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="range"
                      selected={dateRange}
                      onSelect={(range) => handleDateRangeChange({
                        from: range?.from,
                        to: range?.to
                      })}
                      numberOfMonths={2}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              
              <div className="space-y-2">
                <Label>Quick Filters</Label>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleQuickDateFilter(1)}>
                    Last 24h
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleQuickDateFilter(7)}>
                    Last 7d
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleQuickDateFilter(30)}>
                    Last 30d
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Audit Entries */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Audit Entries
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3" style={{ maxHeight, overflowY: 'auto' }}>
            {isLoading ? (
              <div className="flex items-center justify-center h-32">
                <RefreshCw className="h-6 w-6 animate-spin mr-2" />
                <span>Loading audit entries...</span>
              </div>
            ) : filteredEntries.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No Audit Entries</h3>
                <p className="text-muted-foreground">
                  No audit entries found matching your current filters.
                </p>
              </div>
            ) : (
              filteredEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="p-4 border rounded-lg hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {getActionBadge(entry.action)}
                        <span className="font-medium">
                          {entry.entityType}:{entry.entityId}
                        </span>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {format(entry.timestamp, 'MMM d, yyyy HH:mm:ss')}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        {entry.userId && (
                          <div className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {entry.userId}
                          </div>
                        )}
                        {entry.userRole && (
                          <div className="flex items-center gap-1">
                            <Shield className="h-3 w-3" />
                            {entry.userRole}
                          </div>
                        )}
                        {entry.impersonatingUserId && (
                          <div className="flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            Impersonating: {entry.impersonatingUserId}
                          </div>
                        )}
                      </div>

                      {entry.changes && Object.keys(entry.changes).length > 0 && (
                        <div className="mt-2 text-sm">
                          <span className="font-medium">Changes:</span>
                          <div className="ml-2 mt-1 space-y-1">
                            {Object.entries(entry.changes).map(([field, change]) => (
                              <div key={field} className="text-xs font-mono bg-muted/50 p-2 rounded">
                                <span className="font-medium">{field}:</span> 
                                <span className="text-red-600"> {JSON.stringify(change.from)}</span>
                                <span className="mx-1">→</span>
                                <span className="text-green-600">{JSON.stringify(change.to)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {entry.rbacDetails && (
                        <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-sm">
                          <div className="font-medium text-blue-800">RBAC Details:</div>
                          <div className="text-blue-700">
                            Action: {entry.rbacDetails.action_type}
                            {entry.rbacDetails.target_role_id && (
                              <span> • Role: {entry.rbacDetails.target_role_id}</span>
                            )}
                            {entry.rbacDetails.target_permission_id && (
                              <span> • Permission: {entry.rbacDetails.target_permission_id}</span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedEntry(entry)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Pagination */}
          {filteredEntries.length > 0 && totalCount > (filters.pageSize || 50) && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t">
              <div className="text-sm text-muted-foreground">
                Page {filters.page || 1} of {Math.ceil(totalCount / (filters.pageSize || 50))}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={(filters.page || 1) <= 1}
                  onClick={() => handleFilterChange('page', (filters.page || 1) - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={(filters.page || 1) >= Math.ceil(totalCount / (filters.pageSize || 50))}
                  onClick={() => handleFilterChange('page', (filters.page || 1) + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Entry Details Modal */}
      {selectedEntry && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Audit Entry Details
              <Button variant="outline" size="sm" onClick={() => setSelectedEntry(null)}>
                Close
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium text-muted-foreground">Entry ID</Label>
                <p className="text-sm font-mono">{selectedEntry.id}</p>
              </div>
              <div>
                <Label className="text-sm font-medium text-muted-foreground">Timestamp</Label>
                <p className="text-sm">{format(selectedEntry.timestamp, 'PPpp')}</p>
              </div>
              <div>
                <Label className="text-sm font-medium text-muted-foreground">Action</Label>
                <div className="mt-1">{getActionBadge(selectedEntry.action)}</div>
              </div>
              <div>
                <Label className="text-sm font-medium text-muted-foreground">Entity</Label>
                <p className="text-sm">{selectedEntry.entityType}:{selectedEntry.entityId}</p>
              </div>
              {selectedEntry.userId && (
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">User ID</Label>
                  <p className="text-sm">{selectedEntry.userId}</p>
                </div>
              )}
              {selectedEntry.userRole && (
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">User Role</Label>
                  <p className="text-sm">{selectedEntry.userRole}</p>
                </div>
              )}
              {selectedEntry.sessionId && (
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Session ID</Label>
                  <p className="text-sm font-mono">{selectedEntry.sessionId}</p>
                </div>
              )}
              {selectedEntry.ipAddress && (
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">IP Address</Label>
                  <p className="text-sm font-mono">{selectedEntry.ipAddress}</p>
                </div>
              )}
            </div>

            {selectedEntry.metadata && Object.keys(selectedEntry.metadata).length > 0 && (
              <div>
                <Label className="text-sm font-medium text-muted-foreground">Metadata</Label>
                <pre className="text-xs bg-muted p-3 rounded mt-1 overflow-auto">
                  {JSON.stringify(selectedEntry.metadata, null, 2)}
                </pre>
              </div>
            )}

            {selectedEntry.changes && Object.keys(selectedEntry.changes).length > 0 && (
              <div>
                <Label className="text-sm font-medium text-muted-foreground">Changes</Label>
                <div className="mt-2 space-y-2">
                  {Object.entries(selectedEntry.changes).map(([field, change]) => (
                    <div key={field} className="p-3 bg-muted/50 rounded">
                      <div className="font-medium text-sm">{field}</div>
                      <div className="mt-1 text-xs space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">From:</span>
                          <span className="font-mono text-red-600">
                            {JSON.stringify(change.from)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">To:</span>
                          <span className="font-mono text-green-600">
                            {JSON.stringify(change.to)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Error Display */}
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
};
