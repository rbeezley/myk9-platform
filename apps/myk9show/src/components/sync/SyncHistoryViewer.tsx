import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  RefreshCw,
  Clock,
  CheckCircle,
  AlertCircle,
  XCircle,
  GitBranch,
  Search,
  Filter,
  Download,
  Trash2
} from 'lucide-react';

interface SyncLogEntry {
  id: string;
  entityType: 'club' | 'person' | 'dog' | 'show' | 'entry';
  entityId: string;
  entityName: string;
  actionType: 'create' | 'update' | 'delete';
  status: 'pending' | 'synced' | 'error' | 'conflict';
  timestamp: Date;
  userId: string;
  userName: string;
  errorMessage?: string;
  retryCount?: number;
  syncDuration?: number; // in milliseconds
  dataSize?: number; // in bytes
}

interface SyncHistoryViewerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRetrySync?: (entryId: string) => void;
  onClearHistory?: () => void;
  onExportHistory?: () => void;
}

// Mock data for demonstration - computed at render time so timestamps are relative to current time
function createMockSyncHistory(): SyncLogEntry[] {
  const now = Date.now();
  return [
    {
      id: 'sync-1',
      entityType: 'club',
      entityId: 'club-1',
      entityName: 'Golden Retriever Club',
      actionType: 'update',
      status: 'synced',
      timestamp: new Date(now - 1000 * 60 * 5),
      userId: 'user-1',
      userName: 'John Doe',
      syncDuration: 1200,
      dataSize: 2048
    },
    {
      id: 'sync-2',
      entityType: 'dog',
      entityId: 'dog-1',
      entityName: 'Buddy',
      actionType: 'create',
      status: 'error',
      timestamp: new Date(now - 1000 * 60 * 15),
      userId: 'user-2',
      userName: 'Jane Smith',
      errorMessage: 'Network timeout during sync',
      retryCount: 3,
      dataSize: 4096
    },
    {
      id: 'sync-3',
      entityType: 'person',
      entityId: 'person-1',
      entityName: 'Alice Johnson',
      actionType: 'update',
      status: 'conflict',
      timestamp: new Date(now - 1000 * 60 * 30),
      userId: 'user-3',
      userName: 'Bob Wilson',
      dataSize: 1536
    },
    {
      id: 'sync-4',
      entityType: 'show',
      entityId: 'show-1',
      entityName: 'Spring Dog Show 2024',
      actionType: 'create',
      status: 'pending',
      timestamp: new Date(now - 1000 * 60 * 45),
      userId: 'user-1',
      userName: 'John Doe',
      retryCount: 1,
      dataSize: 8192
    },
    {
      id: 'sync-5',
      entityType: 'entry',
      entityId: 'entry-1',
      entityName: 'Buddy - Novice Class',
      actionType: 'delete',
      status: 'synced',
      timestamp: new Date(now - 1000 * 60 * 60),
      userId: 'user-2',
      userName: 'Jane Smith',
      syncDuration: 800,
      dataSize: 512
    }
  ];
}

export function SyncHistoryViewer({
  open,
  onOpenChange,
  onRetrySync,
  onClearHistory,
  onExportHistory
}: SyncHistoryViewerProps) {
  const [syncHistory] = React.useState<SyncLogEntry[]>(createMockSyncHistory);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<string>('all');
  const [entityTypeFilter, setEntityTypeFilter] = React.useState<string>('all');

  const filteredHistory = React.useMemo(() => {
    return syncHistory.filter(entry => {
      const matchesSearch = searchTerm === '' || 
        entry.entityName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.userName.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = statusFilter === 'all' || entry.status === statusFilter;
      const matchesEntityType = entityTypeFilter === 'all' || entry.entityType === entityTypeFilter;
      
      return matchesSearch && matchesStatus && matchesEntityType;
    });
  }, [syncHistory, searchTerm, statusFilter, entityTypeFilter]);

  const getStatusIcon = (status: SyncLogEntry['status']) => {
    switch (status) {
      case 'synced':
        return <CheckCircle className="h-4 w-4 text-success-green" />;
      case 'pending':
        return <RefreshCw className="h-4 w-4 text-warning-orange animate-spin" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-error-red" />;
      case 'conflict':
        return <AlertCircle className="h-4 w-4 text-warning-orange" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: SyncLogEntry['status']) => {
    const variants = {
      synced: 'bg-success-green/10 text-success-green border-success-green/20',
      pending: 'bg-warning-orange/10 text-warning-orange border-warning-orange/20',
      error: 'bg-error-red/10 text-error-red border-error-red/20',
      conflict: 'bg-warning-orange/10 text-warning-orange border-warning-orange/20'
    };

    return (
      <Badge variant="outline" className={variants[status]}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const getActionIcon = (actionType: SyncLogEntry['actionType']) => {
    switch (actionType) {
      case 'create':
        return '＋';
      case 'update':
        return '✎';
      case 'delete':
        return '×';
      default:
        return '•';
    }
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return 'N/A';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return 'N/A';
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  const formatRelativeTime = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const getSyncStatistics = () => {
    const total = syncHistory.length;
    const synced = syncHistory.filter(e => e.status === 'synced').length;
    const pending = syncHistory.filter(e => e.status === 'pending').length;
    const errors = syncHistory.filter(e => e.status === 'error').length;
    const conflicts = syncHistory.filter(e => e.status === 'conflict').length;

    return { total, synced, pending, errors, conflicts };
  };

  const stats = getSyncStatistics();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw] max-h-[90vh] bg-card/95 backdrop-blur-xl border-0 shadow-2xl rounded-2xl">
        <DialogHeader className="pb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 p-3 rounded-xl">
                <GitBranch className="h-6 w-6 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-xl font-semibold">
                  Sync History
                </DialogTitle>
                <DialogDescription className="text-muted-foreground mt-1">
                  View and manage data synchronization history and status
                </DialogDescription>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {onExportHistory && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onExportHistory}
                  className="border-border/50"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
              )}
              {onClearHistory && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onClearHistory}
                  className="border-error-red/20 text-error-red hover:bg-error-red/5"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        {/* Statistics Overview */}
        <div className="grid grid-cols-5 gap-4 mb-6">
          <div className="bg-muted/30 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-xs text-muted-foreground">Total</div>
          </div>
          <div className="bg-success-green/10 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-success-green">{stats.synced}</div>
            <div className="text-xs text-success-green">Synced</div>
          </div>
          <div className="bg-warning-orange/10 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-warning-orange">{stats.pending}</div>
            <div className="text-xs text-warning-orange">Pending</div>
          </div>
          <div className="bg-error-red/10 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-error-red">{stats.errors}</div>
            <div className="text-xs text-error-red">Errors</div>
          </div>
          <div className="bg-warning-orange/10 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-warning-orange">{stats.conflicts}</div>
            <div className="text-xs text-warning-orange">Conflicts</div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search entities or users..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="synced">Synced</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="error">Error</SelectItem>
              <SelectItem value="conflict">Conflict</SelectItem>
            </SelectContent>
          </Select>

          <Select value={entityTypeFilter} onValueChange={setEntityTypeFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Entity Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="club">Clubs</SelectItem>
              <SelectItem value="person">Users</SelectItem>
              <SelectItem value="dog">Dogs</SelectItem>
              <SelectItem value="show">Shows</SelectItem>
              <SelectItem value="entry">Entries</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Sync History List */}
        <ScrollArea className="max-h-96">
          <div className="space-y-3">
            {filteredHistory.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <GitBranch className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No sync history matches your filters</p>
              </div>
            ) : (
              filteredHistory.map((entry) => (
                <div
                  key={entry.id}
                  className="border border-border/50 rounded-lg p-4 hover:bg-muted/20 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(entry.status)}
                        <span className="text-lg font-mono text-muted-foreground">
                          {getActionIcon(entry.actionType)}
                        </span>
                      </div>
                      
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{entry.entityName}</span>
                          <Badge variant="outline" className="text-xs">
                            {entry.entityType}
                          </Badge>
                          {getStatusBadge(entry.status)}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {entry.actionType.charAt(0).toUpperCase() + entry.actionType.slice(1)} by {entry.userName}
                        </div>
                      </div>
                    </div>

                    <div className="text-right text-sm text-muted-foreground">
                      <div>{formatRelativeTime(entry.timestamp)}</div>
                      {entry.syncDuration && (
                        <div className="text-xs">Duration: {formatDuration(entry.syncDuration)}</div>
                      )}
                      {entry.dataSize && (
                        <div className="text-xs">Size: {formatSize(entry.dataSize)}</div>
                      )}
                    </div>
                  </div>

                  {entry.errorMessage && (
                    <div className="mt-3 p-3 bg-error-red/5 border border-error-red/20 rounded-md">
                      <div className="text-sm text-error-red font-medium">Error:</div>
                      <div className="text-sm text-error-red/80">{entry.errorMessage}</div>
                    </div>
                  )}

                  {entry.retryCount != null && entry.retryCount > 0 && (
                    <div className="text-xs text-muted-foreground mt-1">
                      Retries: {entry.retryCount}
                    </div>
                  )}

                  {entry.status === 'error' && onRetrySync && (
                    <div className="mt-3 flex justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onRetrySync(entry.id)}
                        className="border-primary/20 text-primary hover:bg-primary/5"
                      >
                        <RefreshCw className="h-3 w-3 mr-1" />
                        Retry Sync
                      </Button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        <Separator />

        <div className="flex justify-between items-center text-sm text-muted-foreground">
          <div>
            Showing {filteredHistory.length} of {syncHistory.length} sync operations
          </div>
          <div>
            Last updated: {formatRelativeTime(new Date())}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}