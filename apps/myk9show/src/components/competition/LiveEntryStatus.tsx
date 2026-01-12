/**
 * Live Entry Status Component
 * Phase 6.2: Live Competition Features
 * 
 * Real-time display component for entry statuses during live competitions,
 * showing ring status, check-in status, and call notifications.
 */

import React, { useState, useMemo } from 'react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { ScrollArea } from '../ui/scroll-area';
import { 
import { logger } from '@/services/LoggingService';
  Search, 
  Filter,
  Clock,
  CheckCircle,
  AlertCircle,
  User,
  Trophy,
  Phone,
  MoreHorizontal,
  Eye,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';

import type { EntryStatus } from '../../services/competition/liveCompetitionService';
import type { RingStatusEvent, CallToRingNotification } from '../../services/competition/entryStatusBroadcaster';
import { CHECK_IN_STATUS_CONFIG } from '../../types/check-in-types';
import { formatDistanceToNow } from 'date-fns';

export interface LiveEntryStatusProps {
  entryStatuses: Map<string, EntryStatus>;
  ringEvents: RingStatusEvent[];
  callNotifications: CallToRingNotification[];
  onEntryClick?: (entryId: string) => void;
  onUpdateStatus?: (entryId: string, status: EntryStatus['ringStatus']) => Promise<void>;
  showId: string;
  classId?: string;
  className?: string;
}

const RING_STATUS_CONFIG = {
  waiting: {
    label: 'Waiting',
    color: 'bg-gray-100 text-gray-700',
    icon: Clock,
    priority: 1,
  },
  'on-deck': {
    label: 'On Deck',
    color: 'bg-yellow-100 text-yellow-700',
    icon: Clock,
    priority: 2,
  },
  called: {
    label: 'Called',
    color: 'bg-orange-100 text-orange-700',
    icon: Phone,
    priority: 3,
  },
  'in-ring': {
    label: 'In Ring',
    color: 'bg-blue-100 text-blue-700',
    icon: Trophy,
    priority: 4,
  },
  completed: {
    label: 'Completed',
    color: 'bg-green-100 text-green-700',
    icon: CheckCircle,
    priority: 5,
  },
  absent: {
    label: 'Absent',
    color: 'bg-red-100 text-red-700',
    icon: AlertCircle,
    priority: 6,
  },
  excused: {
    label: 'Excused',
    color: 'bg-gray-100 text-gray-500',
    icon: User,
    priority: 7,
  },
};

/**
 * Live Entry Status Component
 */
export function LiveEntryStatus({
  entryStatuses,
  callNotifications,
  onEntryClick,
  onUpdateStatus,
  className = '',
}: LiveEntryStatusProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [ringStatusFilter, setRingStatusFilter] = useState<string>('all');
  const [checkInFilter, setCheckInFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'sequence' | 'armband' | 'name' | 'status'>('sequence');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [selectedView, setSelectedView] = useState<'grid' | 'list'>('list');

  // Convert Map to Array and filter/sort
  const filteredEntries = useMemo(() => {
    let entries = Array.from(entryStatuses.values());

    // Apply filters
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      entries = entries.filter(entry => 
        entry.armband.toLowerCase().includes(term) ||
        (entry as EntryStatus & { dogName?: string; ownerName?: string }).dogName?.toLowerCase().includes(term) ||
        (entry as EntryStatus & { dogName?: string; ownerName?: string }).ownerName?.toLowerCase().includes(term)
      );
    }

    if (ringStatusFilter !== 'all') {
      entries = entries.filter(entry => entry.ringStatus === ringStatusFilter);
    }

    if (checkInFilter !== 'all') {
      entries = entries.filter(entry => entry.checkInStatus === checkInFilter);
    }

    // Apply sorting
    entries.sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'sequence':
          comparison = a.sequence - b.sequence;
          break;
        case 'armband':
          comparison = a.armband.localeCompare(b.armband);
          break;
        case 'name':
          comparison = ((a as EntryStatus & { dogName?: string }).dogName || '').localeCompare((b as EntryStatus & { dogName?: string }).dogName || '');
          break;
        case 'status': {
          const aConfig = RING_STATUS_CONFIG[a.ringStatus];
          const bConfig = RING_STATUS_CONFIG[b.ringStatus];
          comparison = aConfig.priority - bConfig.priority;
          break;
        }
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return entries;
  }, [entryStatuses, searchTerm, ringStatusFilter, checkInFilter, sortBy, sortOrder]);

  // Get recent calls for an entry
  const getRecentCalls = (entryId: string) => {
    return callNotifications
      .filter(call => call.entryId === entryId)
      .slice(-3);
  };

  // Get entry ring status config
  const getRingStatusConfig = (status: EntryStatus['ringStatus']) => {
    return RING_STATUS_CONFIG[status] || RING_STATUS_CONFIG.waiting;
  };

  // Handle status update
  const handleStatusUpdate = async (entryId: string, newStatus: EntryStatus['ringStatus']) => {
    try {
      await onUpdateStatus?.(entryId, newStatus);
    } catch (error) {
      logger.error('Failed to update entry status:', 'competition', {}, error as Error);
    }
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Live Entry Status</h2>
          <p className="text-sm text-muted-foreground">
            {filteredEntries.length} of {entryStatuses.size} entries
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={selectedView === 'list' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedView('list')}
          >
            List
          </Button>
          <Button
            variant={selectedView === 'grid' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedView('grid')}
          >
            Grid
          </Button>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by armband, dog name, or owner..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        <Select value={ringStatusFilter} onValueChange={setRingStatusFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Ring Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Ring Status</SelectItem>
            {Object.entries(RING_STATUS_CONFIG).map(([status, config]) => (
              <SelectItem key={status} value={status}>
                {config.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={checkInFilter} onValueChange={setCheckInFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Check-in Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Check-in</SelectItem>
            {Object.entries(CHECK_IN_STATUS_CONFIG).map(([status, config]) => (
              <SelectItem key={status} value={status}>
                {config.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={`${sortBy}-${sortOrder}`} onValueChange={(value) => {
          const [sort, order] = value.split('-') as [typeof sortBy, typeof sortOrder];
          setSortBy(sort);
          setSortOrder(order);
        }}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Sort By" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="sequence-asc">Sequence ↑</SelectItem>
            <SelectItem value="sequence-desc">Sequence ↓</SelectItem>
            <SelectItem value="armband-asc">Armband ↑</SelectItem>
            <SelectItem value="armband-desc">Armband ↓</SelectItem>
            <SelectItem value="name-asc">Name ↑</SelectItem>
            <SelectItem value="name-desc">Name ↓</SelectItem>
            <SelectItem value="status-asc">Status ↑</SelectItem>
            <SelectItem value="status-desc">Status ↓</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Entry List/Grid */}
      <Card>
        <CardContent className="p-0">
          <ScrollArea className="h-[600px]">
            {selectedView === 'list' ? (
              <div className="divide-y">
                {filteredEntries.length > 0 ? (
                  filteredEntries.map((entry) => {
                    const ringConfig = getRingStatusConfig(entry.ringStatus);
                    const checkInConfig = CHECK_IN_STATUS_CONFIG[entry.checkInStatus];
                    const recentCalls = getRecentCalls(entry.entryId);
                    const RingIcon = ringConfig.icon;

                    return (
                      <div
                        key={entry.entryId}
                        className="flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors"
                      >
                        {/* Sequence Number */}
                        <div className="w-12 text-center">
                          <div className="text-lg font-bold text-muted-foreground">
                            {entry.sequence}
                          </div>
                        </div>

                        {/* Armband */}
                        <div className="w-20">
                          <Badge variant="outline" className="text-sm font-mono">
                            {entry.armband}
                          </Badge>
                        </div>

                        {/* Dog/Owner Info */}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">
                            {(entry as EntryStatus & { dogName?: string }).dogName || 'Unknown Dog'}
                          </p>
                          <p className="text-sm text-muted-foreground truncate">
                            {(entry as EntryStatus & { ownerName?: string }).ownerName || 'Unknown Owner'}
                          </p>
                          {entry.ringAssignment && (
                            <p className="text-xs text-muted-foreground">
                              Ring: {entry.ringAssignment}
                            </p>
                          )}
                        </div>

                        {/* Check-in Status */}
                        <div className="w-32">
                          <Badge 
                            className={`${checkInConfig.backgroundColor} ${checkInConfig.color} border-0`}
                          >
                            {checkInConfig.icon && <span className="mr-1">{checkInConfig.icon}</span>}
                            {checkInConfig.label}
                          </Badge>
                        </div>

                        {/* Ring Status */}
                        <div className="w-32">
                          <Badge className={`${ringConfig.color} border-0`}>
                            <RingIcon className="w-3 h-3 mr-1" />
                            {ringConfig.label}
                          </Badge>
                        </div>

                        {/* Recent Calls */}
                        <div className="w-24 text-center">
                          {recentCalls.length > 0 && (
                            <div className="text-xs text-muted-foreground">
                              <Phone className="h-3 w-3 inline mr-1" />
                              {recentCalls.length}
                            </div>
                          )}
                        </div>

                        {/* Last Updated */}
                        <div className="w-20 text-xs text-muted-foreground">
                          {formatDistanceToNow(entry.updatedAt, { addSuffix: true })}
                        </div>

                        {/* Actions */}
                        <div className="w-12">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => onEntryClick?.(entry.entryId)}>
                                <Eye className="h-4 w-4 mr-2" />
                                View Details
                              </DropdownMenuItem>
                              
                              <DropdownMenuSeparator />
                              
                              <DropdownMenuItem 
                                onClick={() => handleStatusUpdate(entry.entryId, 'on-deck')}
                                disabled={entry.ringStatus === 'on-deck'}
                              >
                                Set On Deck
                              </DropdownMenuItem>
                              
                              <DropdownMenuItem 
                                onClick={() => handleStatusUpdate(entry.entryId, 'called')}
                                disabled={entry.ringStatus === 'called'}
                              >
                                Call to Ring
                              </DropdownMenuItem>
                              
                              <DropdownMenuItem 
                                onClick={() => handleStatusUpdate(entry.entryId, 'in-ring')}
                                disabled={entry.ringStatus === 'in-ring'}
                              >
                                Mark In Ring
                              </DropdownMenuItem>
                              
                              <DropdownMenuItem 
                                onClick={() => handleStatusUpdate(entry.entryId, 'completed')}
                                disabled={entry.ringStatus === 'completed'}
                              >
                                Mark Completed
                              </DropdownMenuItem>
                              
                              <DropdownMenuSeparator />
                              
                              <DropdownMenuItem 
                                onClick={() => handleStatusUpdate(entry.entryId, 'absent')}
                                className="text-red-600"
                              >
                                Mark Absent
                              </DropdownMenuItem>
                              
                              <DropdownMenuItem 
                                onClick={() => handleStatusUpdate(entry.entryId, 'excused')}
                                className="text-gray-600"
                              >
                                Mark Excused
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <Filter className="h-8 w-8 mx-auto mb-4 opacity-50" />
                    <p>No entries match the current filters</p>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="mt-2"
                      onClick={() => {
                        setSearchTerm('');
                        setRingStatusFilter('all');
                        setCheckInFilter('all');
                      }}
                    >
                      Clear Filters
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              /* Grid View */
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4">
                {filteredEntries.map((entry) => {
                  const ringConfig = getRingStatusConfig(entry.ringStatus);
                  const checkInConfig = CHECK_IN_STATUS_CONFIG[entry.checkInStatus];
                  const recentCalls = getRecentCalls(entry.entryId);
                  const RingIcon = ringConfig.icon;

                  return (
                    <Card 
                      key={entry.entryId}
                      className="cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => onEntryClick?.(entry.entryId)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <Badge variant="outline" className="font-mono">
                            {entry.armband}
                          </Badge>
                          <div className="text-sm text-muted-foreground">
                            #{entry.sequence}
                          </div>
                        </div>

                        <div className="space-y-2 mb-3">
                          <p className="font-medium text-sm truncate">
                            {(entry as EntryStatus & { dogName?: string }).dogName || 'Unknown Dog'}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {(entry as EntryStatus & { ownerName?: string }).ownerName || 'Unknown Owner'}
                          </p>
                          {entry.ringAssignment && (
                            <p className="text-xs text-muted-foreground">
                              Ring: {entry.ringAssignment}
                            </p>
                          )}
                        </div>

                        <div className="space-y-2">
                          <Badge 
                            className={`w-full justify-center ${checkInConfig.backgroundColor} ${checkInConfig.color} border-0 text-xs`}
                          >
                            {checkInConfig.icon && <span className="mr-1">{checkInConfig.icon}</span>}
                            {checkInConfig.label}
                          </Badge>

                          <Badge className={`w-full justify-center ${ringConfig.color} border-0 text-xs`}>
                            <RingIcon className="w-3 h-3 mr-1" />
                            {ringConfig.label}
                          </Badge>
                        </div>

                        {recentCalls.length > 0 && (
                          <div className="mt-2 text-center">
                            <div className="text-xs text-muted-foreground">
                              <Phone className="h-3 w-3 inline mr-1" />
                              {recentCalls.length} call{recentCalls.length !== 1 ? 's' : ''}
                            </div>
                          </div>
                        )}

                        <div className="mt-2 text-center text-xs text-muted-foreground">
                          {formatDistanceToNow(entry.updatedAt, { addSuffix: true })}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

export default LiveEntryStatus;