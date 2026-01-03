import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Search, 
  Filter, 
  RefreshCw, 
  Users, 
  Calendar,
  MapPin,
  AlertTriangle,
  CheckCircle,
  Clock,
  XCircle
} from 'lucide-react';
import { SyncStatusIndicator } from './SyncStatusIndicator';
import { useShowStore } from '@/store/showStore';
import type { SyncStatus } from './SyncStatusIndicator';

interface ClassSyncStatusProps {
  /** Show ID to filter classes for specific show */
  showId?: string;
  /** Custom className */
  className?: string;
}

interface ClassSyncData {
  id: string;
  name: string;
  trialName: string;
  showName: string;
  judgeNames: string[];
  entryCount: number;
  syncStatus: SyncStatus;
  lastSyncAt?: Date;
  errorMessage?: string;
  schedule?: {
    date: string;
    time: string;
    ring?: string;
  };
}

/**
 * ClassSyncStatus - Displays sync status for all classes with filtering and actions
 * 
 * Shows detailed sync information for classes including entry counts, schedules,
 * and sync errors. Provides filtering and bulk actions for class management.
 */
export const ClassSyncStatus: React.FC<ClassSyncStatusProps> = ({
  showId,
  className = ''
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [classes, setClasses] = useState<ClassSyncData[]>([]);

  const { shows } = useShowStore();

  // Mock data - replace with actual data loading
  useEffect(() => {
    const loadClassData = () => {
      // Mock class data with sync status
      const mockClasses: ClassSyncData[] = [
        {
          id: 'class-1',
          name: 'Novice A',
          trialName: 'Obedience Trial 1',
          showName: 'Spring Classic Dog Show',
          judgeNames: ['Judge Smith', 'Judge Johnson'],
          entryCount: 24,
          syncStatus: 'synced',
          lastSyncAt: new Date(Date.now() - 300000), // 5 minutes ago
          schedule: {
            date: '2024-03-15',
            time: '09:00',
            ring: 'Ring 1'
          }
        },
        {
          id: 'class-2',
          name: 'Open B',
          trialName: 'Obedience Trial 1',
          showName: 'Spring Classic Dog Show',
          judgeNames: ['Judge Davis'],
          entryCount: 18,
          syncStatus: 'pending',
          schedule: {
            date: '2024-03-15',
            time: '10:30',
            ring: 'Ring 1'
          }
        },
        {
          id: 'class-3',
          name: 'Utility A',
          trialName: 'Obedience Trial 2',
          showName: 'Spring Classic Dog Show',
          judgeNames: ['Judge Williams'],
          entryCount: 12,
          syncStatus: 'error',
          errorMessage: 'Network timeout during sync',
          schedule: {
            date: '2024-03-15',
            time: '14:00',
            ring: 'Ring 2'
          }
        },
        {
          id: 'class-4',
          name: 'Graduate Novice',
          trialName: 'Obedience Trial 2',
          showName: 'Spring Classic Dog Show',
          judgeNames: ['Judge Brown'],
          entryCount: 15,
          syncStatus: 'conflict',
          errorMessage: 'Entry count mismatch detected',
          schedule: {
            date: '2024-03-15',
            time: '15:30',
            ring: 'Ring 2'
          }
        }
      ];

      // Filter by show if specified
      const filteredClasses = showId 
        ? mockClasses.filter(c => c.showName === shows.find(s => s.id === showId)?.name)
        : mockClasses;

      setClasses(filteredClasses);
    };

    loadClassData();
  }, [showId, shows]);

  // Filter classes based on search and status
  const filteredClasses = classes.filter(classItem => {
    const matchesSearch = classItem.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         classItem.trialName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         classItem.judgeNames.some(judge => 
                           judge.toLowerCase().includes(searchTerm.toLowerCase())
                         );
    
    const matchesStatus = statusFilter === 'all' || classItem.syncStatus === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  // Calculate status counts
  const statusCounts = {
    total: classes.length,
    synced: classes.filter(c => c.syncStatus === 'synced').length,
    pending: classes.filter(c => c.syncStatus === 'pending').length,
    error: classes.filter(c => c.syncStatus === 'error').length,
    conflict: classes.filter(c => c.syncStatus === 'conflict').length
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      // Simulate refresh delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      // In real implementation, trigger sync refresh
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleRetryClass = (classId: string) => {
    // Retry sync for specific class
    console.log('Retrying sync for class:', classId);
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header with stats */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold">Class Sync Status</h3>
          <p className="text-sm text-muted-foreground">
            {statusCounts.total} classes • {statusCounts.synced} synced • {statusCounts.pending + statusCounts.error + statusCounts.conflict} need attention
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Status overview cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card/95 backdrop-blur-sm border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Synced</p>
                <p className="text-xl font-bold text-green-600">{statusCounts.synced}</p>
              </div>
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/95 backdrop-blur-sm border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Pending</p>
                <p className="text-xl font-bold text-orange-600">{statusCounts.pending}</p>
              </div>
              <Clock className="h-6 w-6 text-orange-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/95 backdrop-blur-sm border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Errors</p>
                <p className="text-xl font-bold text-red-600">{statusCounts.error}</p>
              </div>
              <XCircle className="h-6 w-6 text-red-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/95 backdrop-blur-sm border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Conflicts</p>
                <p className="text-xl font-bold text-yellow-600">{statusCounts.conflict}</p>
              </div>
              <AlertTriangle className="h-6 w-6 text-yellow-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search classes, trials, or judges..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-background border-border/50 focus:border-primary focus:ring-2 focus:ring-primary/20 rounded-lg"
            />
          </div>
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px] bg-background border-border/50">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="synced">Synced</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="error">Errors</SelectItem>
            <SelectItem value="conflict">Conflicts</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Classes list */}
      <Card className="bg-card/95 backdrop-blur-sm border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">
            Classes ({filteredClasses.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px]">
            <div className="space-y-4">
              {filteredClasses.map((classItem) => (
                <div
                  key={classItem.id}
                  className="flex items-start justify-between p-4 bg-muted/30 rounded-lg border border-border/50 hover:border-border transition-all duration-200"
                >
                  <div className="flex-1 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <h4 className="font-medium">{classItem.name}</h4>
                        <p className="text-sm text-muted-foreground">
                          {classItem.trialName} • {classItem.showName}
                        </p>
                      </div>
                      <SyncStatusIndicator
                        status={classItem.syncStatus}
                        entityType="class"
                        entityId={classItem.id}
                        showLabel
                        lastSyncAt={classItem.lastSyncAt}
                        errorMessage={classItem.errorMessage}
                        enableActions
                        onRetry={() => handleRetryClass(classItem.id)}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Entries:</span>
                        <span className="font-medium">{classItem.entryCount}</span>
                      </div>
                      
                      {classItem.schedule && (
                        <>
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <span className="text-muted-foreground">Schedule:</span>
                            <span className="font-medium">
                              {new Date(classItem.schedule.date).toLocaleDateString()} {classItem.schedule.time}
                            </span>
                          </div>
                          
                          {classItem.schedule.ring && (
                            <div className="flex items-center gap-2">
                              <MapPin className="h-4 w-4 text-muted-foreground" />
                              <span className="text-muted-foreground">Ring:</span>
                              <span className="font-medium">{classItem.schedule.ring}</span>
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">Judges:</span>
                      <div className="flex flex-wrap gap-1">
                        {classItem.judgeNames.map((judge, index) => (
                          <Badge key={index} variant="secondary" className="text-xs">
                            {judge}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    {classItem.errorMessage && (
                      <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-2 rounded border border-red-200">
                        <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                        <span>{classItem.errorMessage}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {filteredClasses.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No classes match your filters</p>
                  {searchTerm && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSearchTerm('')}
                      className="mt-2"
                    >
                      Clear search
                    </Button>
                  )}
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
};

export default ClassSyncStatus;