import React, { useState, useMemo, startTransition } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Dog, 
  Clock, 
  AlertTriangle, 
  Calendar,
  MapPin,
  Users,
  ChevronRight,
  Filter,
  CheckCircle,
  XCircle
} from 'lucide-react';
import { ExhibitorEntry, CheckInStatus } from '@/types/exhibitor-types';
import { cn } from '@/lib/utils';

interface MultiDogScheduleProps {
  entries: ExhibitorEntry[];
}

interface TimeSlot {
  time: Date;
  entries: ExhibitorEntry[];
  hasConflict: boolean;
}

interface DogGroup {
  dogId: string;
  dogName: string;
  entries: ExhibitorEntry[];
}

const MultiDogSchedule: React.FC<MultiDogScheduleProps> = ({ 
  entries
}) => {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<'timeline' | 'by-dog'>('timeline');
  const [selectedDog, setSelectedDog] = useState<string | null>(null);
  const [showConflictsOnly, setShowConflictsOnly] = useState(false);

  // Group entries by dog
  const dogGroups = useMemo(() => {
    const groups = new Map<string, DogGroup>();
    
    entries.forEach(entry => {
      const dogId = entry.dogCallName; // Using call name as ID for demo
      if (!groups.has(dogId)) {
        groups.set(dogId, {
          dogId,
          dogName: entry.dogCallName,
          entries: []
        });
      }
      groups.get(dogId)!.entries.push(entry);
    });

    return Array.from(groups.values()).sort((a, b) => 
      a.dogName.localeCompare(b.dogName)
    );
  }, [entries]);

  // Create timeline with conflict detection
  const timeline = useMemo(() => {
    const slots = new Map<string, TimeSlot>();
    
    entries.forEach(entry => {
      const timeKey = entry.scheduledTime ? entry.scheduledTime.toISOString() : 'TBD';
      if (!slots.has(timeKey)) {
        slots.set(timeKey, {
          time: entry.scheduledTime ? new Date(entry.scheduledTime) : new Date(),
          entries: [],
          hasConflict: false
        });
      }
      slots.get(timeKey)!.entries.push(entry);
    });

    // Check for conflicts (multiple dogs at same time)
    slots.forEach(slot => {
      const uniqueDogs = new Set(slot.entries.map(e => e.dogCallName));
      slot.hasConflict = uniqueDogs.size > 1;
    });

    return Array.from(slots.values()).sort((a, b) => 
      a.time.getTime() - b.time.getTime()
    );
  }, [entries]);

  // Filter timeline if showing conflicts only
  const displayTimeline = showConflictsOnly 
    ? timeline.filter(slot => slot.hasConflict)
    : timeline;

  // Calculate statistics
  const stats = useMemo(() => {
    const completed = entries.filter(e => e.checkInStatus === 'completed').length;
    const checkedIn = entries.filter(e => e.checkInStatus === 'checked-in').length;
    const conflicts = timeline.filter(slot => slot.hasConflict).length;
    
    return { completed, checkedIn, conflicts };
  }, [entries, timeline]);

  // Get status color
  const getStatusColor = (status: CheckInStatus) => {
    switch (status) {
      case 'checked-in':
        return 'text-green-600 dark:text-green-400';
      case 'scratched':
        return 'text-red-600 dark:text-red-400';
      case 'completed':
        return 'text-purple-600 dark:text-purple-400';
      case 'absent':
        return 'text-orange-600 dark:text-orange-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  // Format time
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  };

  return (
    <div className="max-w-2xl mx-auto p-4 pb-20">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 mb-4">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Multi-Dog Schedule
        </h2>
        
        {/* Statistics */}
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {dogGroups.length}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Dogs</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {entries.length}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Classes</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
              {stats.conflicts}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Conflicts</div>
          </div>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
          <button
            onClick={() => setViewMode('timeline')}
            className={cn(
              "flex-1 px-3 py-2 rounded text-sm font-medium transition-colors",
              viewMode === 'timeline' 
                ? "bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm" 
                : "text-gray-600 dark:text-gray-400"
            )}
          >
            <Calendar className="w-4 h-4 inline mr-1" />
            Timeline
          </button>
          <button
            onClick={() => setViewMode('by-dog')}
            className={cn(
              "flex-1 px-3 py-2 rounded text-sm font-medium transition-colors",
              viewMode === 'by-dog' 
                ? "bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm" 
                : "text-gray-600 dark:text-gray-400"
            )}
          >
            <Dog className="w-4 h-4 inline mr-1" />
            By Dog
          </button>
        </div>
      </div>

      {/* Conflict Filter */}
      {stats.conflicts > 0 && viewMode === 'timeline' && (
        <button
          onClick={() => setShowConflictsOnly(!showConflictsOnly)}
          className={cn(
            "w-full mb-4 px-4 py-3 rounded-lg flex items-center justify-between transition-colors",
            showConflictsOnly
              ? "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300"
              : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
          )}
        >
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5" />
            <span className="font-medium">Show Conflicts Only</span>
          </div>
          <span className="text-sm">
            {stats.conflicts} conflict{stats.conflicts !== 1 ? 's' : ''}
          </span>
        </button>
      )}

      {/* Timeline View */}
      {viewMode === 'timeline' && (
        <div className="space-y-4">
          {displayTimeline.map((slot, index) => (
            <div key={index} className="relative">
              {/* Time marker */}
              <div className="flex items-center gap-3 mb-2">
                <Clock className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {formatTime(slot.time)}
                </span>
                {slot.hasConflict && (
                  <span className="flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400">
                    <AlertTriangle className="w-3 h-3" />
                    Conflict
                  </span>
                )}
              </div>

              {/* Entries at this time */}
              <div className={cn(
                "ml-7 space-y-2",
                slot.hasConflict && "p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800"
              )}>
                {slot.entries.map(entry => (
                  <div
                    key={entry.id}
                    onClick={() => startTransition(() => navigate(`/exhibitor/check-in/${entry.id}`))}
                    className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 cursor-pointer hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Dog className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            {entry.dogCallName}
                          </span>
                          <span className="text-gray-600 dark:text-gray-400">
                            #{entry.armband}
                          </span>
                        </div>
                        <div className="text-sm text-gray-700 dark:text-gray-300">
                          {entry.className}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-600 dark:text-gray-400">
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            Ring {entry.ringNumber}
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {entry.judgeName}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className={cn(
                          "text-sm font-medium",
                          getStatusColor(entry.checkInStatus)
                        )}>
                          {entry.checkInStatus === 'checked-in' && <CheckCircle className="w-4 h-4 inline" />}
                          {entry.checkInStatus === 'scratched' && <XCircle className="w-4 h-4 inline" />}
                          {entry.checkInStatus.replace('-', ' ')}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Connection line */}
              {index < displayTimeline.length - 1 && (
                <div className="absolute left-2 top-8 bottom-0 w-px bg-gray-300 dark:bg-gray-600" />
              )}
            </div>
          ))}
        </div>
      )}

      {/* By Dog View */}
      {viewMode === 'by-dog' && (
        <div className="space-y-4">
          {dogGroups.map(group => {
            const isSelected = selectedDog === group.dogId;
            const completedCount = group.entries.filter(e => e.checkInStatus === 'completed').length;
            
            return (
              <div
                key={group.dogId}
                className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden"
              >
                <button
                  onClick={() => setSelectedDog(isSelected ? null : group.dogId)}
                  className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Dog className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                    <div className="text-left">
                      <div className="font-medium text-gray-900 dark:text-gray-100">
                        {group.dogName}
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        {group.entries.length} classes • {completedCount} completed
                      </div>
                    </div>
                  </div>
                  <ChevronRight className={cn(
                    "w-5 h-5 text-gray-400 transition-transform",
                    isSelected && "rotate-90"
                  )} />
                </button>

                {isSelected && (
                  <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-4 space-y-3">
                    {group.entries.map(entry => (
                      <div
                        key={entry.id}
                        onClick={() => startTransition(() => navigate(`/exhibitor/check-in/${entry.id}`))}
                        className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                      >
                        <div>
                          <div className="font-medium text-gray-900 dark:text-gray-100">
                            {entry.className}
                          </div>
                          <div className="text-sm text-gray-600 dark:text-gray-400">
                            {formatTime(new Date(entry.scheduledTime!))} • Ring {entry.ringNumber}
                          </div>
                        </div>
                        <span className={cn(
                          "text-sm font-medium",
                          getStatusColor(entry.checkInStatus)
                        )}>
                          {entry.checkInStatus.replace('-', ' ')}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Quick Actions */}
      <div className="mt-6 bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
        <div className="text-sm text-blue-800 dark:text-blue-200 mb-2">
          💡 Pro Tip: Tap any class to check in or view details
        </div>
        {stats.conflicts > 0 && (
          <div className="text-sm text-blue-700 dark:text-blue-300">
            You have scheduling conflicts. Consider having a friend handle one of your dogs.
          </div>
        )}
      </div>
    </div>
  );
};

export default MultiDogSchedule;