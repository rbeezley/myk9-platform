import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { logger } from '@/services/LoggingService';
import {
  Clock,
  AlertTriangle, 
  MapPin,
  Users,
  CheckCircle,
  XCircle,
  RefreshCw,
  Search,
  Filter,
  Edit,
  Eye,
  AlertCircle,
  Info
} from 'lucide-react';
import { useShowStore } from '@/store/showStore';

interface ScheduleConflictAlertsProps {
  /** Show ID to filter conflicts for specific show */
  showId?: string | undefined;
  /** Custom className */
  className?: string;
}

interface ScheduleConflict {
  id: string;
  type: 'time_overlap' | 'ring_conflict' | 'judge_conflict' | 'resource_conflict';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  conflictingItems: ConflictingItem[];
  detectedAt: Date;
  resolvedAt?: Date;
  canAutoResolve: boolean;
  suggestedResolution?: string;
  showName: string;
}

interface ConflictingItem {
  id: string;
  type: 'class' | 'trial' | 'break' | 'setup';
  name: string;
  scheduledTime: string;
  duration?: number;
  ring?: string;
  judge?: string;
  entryCount?: number;
}

/**
 * ScheduleConflictAlerts - Monitor and resolve scheduling conflicts
 * 
 * Detects and displays scheduling conflicts such as time overlaps, ring conflicts,
 * judge double-bookings, and resource conflicts with resolution suggestions.
 */
export const ScheduleConflictAlerts: React.FC<ScheduleConflictAlertsProps> = ({
  showId,
  className = ''
}) => {
  const [conflicts, setConflicts] = useState<ScheduleConflict[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  // const [selectedConflict, setSelectedConflict] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { shows } = useShowStore();

  // Load conflict data
  useEffect(() => {
    const loadConflicts = () => {
      // Mock data - replace with actual API calls
      const mockConflicts: ScheduleConflict[] = [
        {
          id: 'conflict-1',
          type: 'time_overlap',
          severity: 'high',
          title: 'Class Time Overlap',
          description: 'Two classes scheduled at overlapping times in the same ring',
          conflictingItems: [
            {
              id: 'class-1',
              type: 'class',
              name: 'Novice A',
              scheduledTime: '09:00',
              duration: 90,
              ring: 'Ring 1',
              judge: 'Judge Smith',
              entryCount: 24
            },
            {
              id: 'class-2',
              type: 'class',
              name: 'Open B',
              scheduledTime: '09:30',
              duration: 75,
              ring: 'Ring 1',
              judge: 'Judge Davis',
              entryCount: 18
            }
          ],
          detectedAt: new Date(Date.now() - 1800000), // 30 minutes ago
          canAutoResolve: true,
          suggestedResolution: 'Move Open B to 10:45 or assign to Ring 2',
          showName: 'Spring Classic Dog Show'
        },
        {
          id: 'conflict-2',
          type: 'judge_conflict',
          severity: 'critical',
          title: 'Judge Double-Booking',
          description: 'Judge scheduled for multiple classes at the same time',
          conflictingItems: [
            {
              id: 'class-3',
              type: 'class',
              name: 'Utility A',
              scheduledTime: '14:00',
              duration: 60,
              ring: 'Ring 2',
              judge: 'Judge Williams',
              entryCount: 12
            },
            {
              id: 'class-4',
              type: 'class',
              name: 'Graduate Novice',
              scheduledTime: '14:00',
              duration: 45,
              ring: 'Ring 3',
              judge: 'Judge Williams',
              entryCount: 15
            }
          ],
          detectedAt: new Date(Date.now() - 3600000), // 1 hour ago
          canAutoResolve: false,
          suggestedResolution: 'Assign different judge or reschedule one class',
          showName: 'Spring Classic Dog Show'
        },
        {
          id: 'conflict-3',
          type: 'ring_conflict',
          severity: 'medium',
          title: 'Ring Setup Conflict',
          description: 'Equipment setup required during class time',
          conflictingItems: [
            {
              id: 'class-5',
              type: 'class',
              name: 'Excellent Standard',
              scheduledTime: '11:00',
              duration: 120,
              ring: 'Ring 4',
              judge: 'Judge Brown',
              entryCount: 30
            },
            {
              id: 'setup-1',
              type: 'setup',
              name: 'Agility Equipment Setup',
              scheduledTime: '11:30',
              duration: 30,
              ring: 'Ring 4'
            }
          ],
          detectedAt: new Date(Date.now() - 900000), // 15 minutes ago
          canAutoResolve: true,
          suggestedResolution: 'Move setup to 13:00 after class completion',
          showName: 'Spring Classic Dog Show'
        }
      ];

      // Filter by show if specified
      const filteredConflicts = showId 
        ? mockConflicts.filter(c => c.showName === shows.find(s => s.id === showId)?.name)
        : mockConflicts;

      setConflicts(filteredConflicts);
    };

    loadConflicts();
  }, [showId, shows]);

  // Filter conflicts based on search and filters
  const filteredConflicts = conflicts.filter(conflict => {
    const matchesSearch = conflict.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         conflict.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         conflict.conflictingItems.some(item => 
                           item.name.toLowerCase().includes(searchTerm.toLowerCase())
                         );
    
    const matchesSeverity = severityFilter === 'all' || conflict.severity === severityFilter;
    const matchesType = typeFilter === 'all' || conflict.type === typeFilter;
    
    return matchesSearch && matchesSeverity && matchesType;
  });

  // Calculate status counts
  const statusCounts = {
    total: conflicts.length,
    critical: conflicts.filter(c => c.severity === 'critical').length,
    high: conflicts.filter(c => c.severity === 'high').length,
    medium: conflicts.filter(c => c.severity === 'medium').length,
    low: conflicts.filter(c => c.severity === 'low').length,
    resolved: conflicts.filter(c => c.resolvedAt).length
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      // Simulate refresh delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      // In real implementation, trigger conflict detection
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleAutoResolve = async (conflictId: string) => {
    const conflict = conflicts.find(c => c.id === conflictId);
    if (!conflict?.canAutoResolve) return;

    logger.debug('Auto-resolving conflict:', 'sync', { data: conflictId });
    // Update conflict as resolved
    setConflicts(prev => prev.map(c => 
      c.id === conflictId 
        ? { ...c, resolvedAt: new Date() }
        : c
    ));
  };

  const getSeverityColor = (severity: ScheduleConflict['severity']): string => {
    switch (severity) {
      case 'critical': return 'text-red-600 bg-red-50 border-red-200';
      case 'high': return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'medium': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'low': return 'text-blue-600 bg-blue-50 border-blue-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getTypeLabel = (type: ScheduleConflict['type']): string => {
    switch (type) {
      case 'time_overlap': return 'Time Overlap';
      case 'ring_conflict': return 'Ring Conflict';
      case 'judge_conflict': return 'Judge Conflict';
      case 'resource_conflict': return 'Resource Conflict';
      default: return 'Unknown';
    }
  };

  const getTypeIcon = (type: ScheduleConflict['type']) => {
    switch (type) {
      case 'time_overlap': return Clock;
      case 'ring_conflict': return MapPin;
      case 'judge_conflict': return Users;
      case 'resource_conflict': return AlertTriangle;
      default: return AlertCircle;
    }
  };

  const formatTime = (time: string): string => {
    // Convert 24-hour time to 12-hour format
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold">Schedule Conflict Alerts</h3>
          <p className="text-sm text-muted-foreground">
            Monitor and resolve scheduling conflicts automatically or manually
          </p>
        </div>
        <Button
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
          {isRefreshing ? 'Checking...' : 'Check Conflicts'}
        </Button>
      </div>

      {/* Status overview */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="bg-card/95 backdrop-blur-sm border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Total</p>
                <p className="text-xl font-bold">{statusCounts.total}</p>
              </div>
              <AlertTriangle className="h-6 w-6 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/95 backdrop-blur-sm border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Critical</p>
                <p className="text-xl font-bold text-red-600">{statusCounts.critical}</p>
              </div>
              <XCircle className="h-6 w-6 text-red-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/95 backdrop-blur-sm border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">High</p>
                <p className="text-xl font-bold text-orange-600">{statusCounts.high}</p>
              </div>
              <AlertTriangle className="h-6 w-6 text-orange-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/95 backdrop-blur-sm border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Medium</p>
                <p className="text-xl font-bold text-yellow-600">{statusCounts.medium}</p>
              </div>
              <Clock className="h-6 w-6 text-yellow-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/95 backdrop-blur-sm border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Resolved</p>
                <p className="text-xl font-bold text-green-600">{statusCounts.resolved}</p>
              </div>
              <CheckCircle className="h-6 w-6 text-green-600" />
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
              placeholder="Search conflicts..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-background border-border/50 focus:border-primary 
                         focus:ring-2 focus:ring-primary/20 rounded-lg"
            />
          </div>
        </div>
        
        <Select value={severityFilter} onValueChange={setSeverityFilter}>
          <SelectTrigger className="w-[140px] bg-background border-border/50">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Severity</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[140px] bg-background border-border/50">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="time_overlap">Time Overlap</SelectItem>
            <SelectItem value="ring_conflict">Ring Conflict</SelectItem>
            <SelectItem value="judge_conflict">Judge Conflict</SelectItem>
            <SelectItem value="resource_conflict">Resource Conflict</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Conflicts list */}
      <Card className="bg-card/95 backdrop-blur-sm border-0 shadow-sm">
        <CardHeader>
          <CardTitle>
            Schedule Conflicts ({filteredConflicts.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredConflicts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-600 opacity-50" />
              <h4 className="font-medium mb-2">No Schedule Conflicts</h4>
              <p className="text-sm">All scheduled items are properly arranged without conflicts</p>
            </div>
          ) : (
            <ScrollArea className="h-[500px]">
              <div className="space-y-4">
                {filteredConflicts.map((conflict) => {
                  const TypeIcon = getTypeIcon(conflict.type);
                  const isResolved = !!conflict.resolvedAt;
                  
                  return (
                    <div
                      key={conflict.id}
                      className={`p-4 rounded-lg border transition-all duration-200 ${
                        isResolved 
                          ? 'bg-green-50 border-green-200' 
                          : 'bg-muted/30 border-border/50 hover:border-border'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-start gap-3">
                          <TypeIcon className={`h-5 w-5 mt-0.5 ${
                            isResolved ? 'text-green-600' : 'text-red-600'
                          }`} />
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium">{conflict.title}</h4>
                              {isResolved && (
                                <Badge className="text-xs bg-green-100 text-green-700 border-green-200">
                                  Resolved
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {conflict.description}
                            </p>
                            <Badge 
                              className={`text-xs px-2 py-1 rounded-full border ${getSeverityColor(conflict.severity)}`}
                            >
                              {conflict.severity.charAt(0).toUpperCase() + conflict.severity.slice(1)} • {getTypeLabel(conflict.type)}
                            </Badge>
                          </div>
                        </div>
                      </div>

                      {/* Conflicting items */}
                      <div className="mb-4">
                        <h5 className="text-sm font-medium mb-2">Conflicting Items:</h5>
                        <div className="grid gap-2">
                          {conflict.conflictingItems.map((item, index) => (
                            <div key={item.id} className="flex items-center justify-between p-3 
                                                         bg-background rounded border border-border/50">
                              <div className="flex items-center gap-3">
                                <div className={`w-2 h-2 rounded-full ${
                                  index === 0 ? 'bg-red-500' : 'bg-orange-500'
                                }`} />
                                <div>
                                  <span className="font-medium">{item.name}</span>
                                  <div className="text-xs text-muted-foreground">
                                    {formatTime(item.scheduledTime)}
                                    {item.duration && ` (${item.duration}m)`}
                                    {item.ring && ` • ${item.ring}`}
                                    {item.judge && ` • ${item.judge}`}
                                  </div>
                                </div>
                              </div>
                              {item.entryCount && (
                                <Badge variant="secondary" className="text-xs">
                                  {item.entryCount} entries
                                </Badge>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Resolution suggestion */}
                      {conflict.suggestedResolution && !isResolved && (
                        <Alert className="mb-3">
                          <Info className="h-4 w-4" />
                          <AlertTitle>Suggested Resolution</AlertTitle>
                          <AlertDescription>{conflict.suggestedResolution}</AlertDescription>
                        </Alert>
                      )}

                      {/* Actions */}
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-muted-foreground">
                          Detected: {conflict.detectedAt.toLocaleString()}
                          {isResolved && (
                            <span> • Resolved: {conflict.resolvedAt?.toLocaleString()}</span>
                          )}
                        </div>
                        
                        {!isResolved && (
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => logger.debug('View details for:', 'sync', { id: conflict.id })}
                              className="gap-2"
                            >
                              <Eye className="h-3 w-3" />
                              Details
                            </Button>
                            
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-2"
                            >
                              <Edit className="h-3 w-3" />
                              Edit Schedule
                            </Button>
                            
                            {conflict.canAutoResolve && (
                              <Button
                                size="sm"
                                onClick={() => handleAutoResolve(conflict.id)}
                                className="gap-2 bg-green-600 hover:bg-green-700"
                              >
                                <CheckCircle className="h-3 w-3" />
                                Auto Resolve
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ScheduleConflictAlerts;