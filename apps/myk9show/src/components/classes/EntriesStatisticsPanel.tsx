/**
 * Apple-styled statistics panel for class entries
 * Provides visual progress tracking and entry statistics
 */

import React from 'react';
import { Users, CheckCircle, Clock, AlertCircle, Edit3, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EntryData } from './types/classTypes';

// Import Apple styles
import '@/styles/apple-show-details.css';

interface EditDataItem {
  hasChanges: boolean;
  isValid: boolean;
  time: string;
  status: string;
  score: string;
  placement: string;
  errors: Array<{ field: string; message: string }>;
  originalData: {
    time: string;
    status: string;
    score: string;
    placement: string;
  };
}

interface EntriesStatisticsPanelProps {
  entries: EntryData[];
  editData: Record<string, EditDataItem>;
  className?: string;
}

interface StatisticCard {
  id: string;
  title: string;
  value: number;
  total?: number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  description: string;
  percentage?: number;
}

export const EntriesStatisticsPanel: React.FC<EntriesStatisticsPanelProps> = ({
  entries,
  editData,
  className
}) => {
  // Calculate comprehensive statistics
  const statistics = React.useMemo(() => {
    const totalEntries = entries.length;
    const entriesWithResults = entries.filter(e => e.time || e.status).length;
    const qualifiedEntries = entries.filter(e => e.status === 'Qualified').length;
    const notQualifiedEntries = entries.filter(e => e.status === 'Not Qualified').length;
    const absentEntries = entries.filter(e => e.status === 'Absent').length;
    const withdrawnEntries = entries.filter(e => e.status === 'Withdrawn').length;
    const pendingEntries = totalEntries - entriesWithResults;
    
    // Edit statistics
    const changedEntries = Object.values(editData).filter((data: EditDataItem) => data.hasChanges);
    const validChanges = changedEntries.filter((data: EditDataItem) => data.isValid).length;
    const invalidChanges = changedEntries.filter((data: EditDataItem) => !data.isValid).length;
    
    // Calculate percentages
    const completionRate = totalEntries > 0 ? Math.round((entriesWithResults / totalEntries) * 100) : 0;
    const qualificationRate = entriesWithResults > 0 ? Math.round((qualifiedEntries / entriesWithResults) * 100) : 0;
    
    return {
      totalEntries,
      entriesWithResults,
      qualifiedEntries,
      notQualifiedEntries,
      absentEntries,
      withdrawnEntries,
      pendingEntries,
      changedEntries: changedEntries.length,
      validChanges,
      invalidChanges,
      completionRate,
      qualificationRate
    };
  }, [entries, editData]);

  // Create statistic cards based on current data
  const statisticCards: StatisticCard[] = React.useMemo(() => {
    const cards: StatisticCard[] = [
      {
        id: 'total',
        title: 'Total Entries',
        value: statistics.totalEntries,
        icon: Users,
        color: 'entries',
        description: 'Total number of entries in this class',
        percentage: 100
      },
      {
        id: 'completed',
        title: 'With Results',
        value: statistics.entriesWithResults,
        total: statistics.totalEntries,
        icon: CheckCircle,
        color: 'trials',
        description: 'Entries that have results entered',
        percentage: statistics.completionRate
      },
      {
        id: 'qualified',
        title: 'Qualified',
        value: statistics.qualifiedEntries,
        total: statistics.entriesWithResults,
        icon: Trophy,
        color: 'qualified',
        description: 'Entries that achieved qualification',
        percentage: statistics.qualificationRate
      },
      {
        id: 'pending',
        title: 'Pending',
        value: statistics.pendingEntries,
        total: statistics.totalEntries,
        icon: Clock,
        color: 'classes',
        description: 'Entries waiting for results',
        percentage: statistics.totalEntries > 0 ? Math.round((statistics.pendingEntries / statistics.totalEntries) * 100) : 0
      }
    ];

    // Add edit statistics if there are changes
    if (statistics.changedEntries > 0) {
      cards.push({
        id: 'editing',
        title: 'Pending Changes',
        value: statistics.validChanges,
        total: statistics.changedEntries,
        icon: Edit3,
        color: 'editing',
        description: `${statistics.validChanges} valid, ${statistics.invalidChanges} invalid changes`,
        percentage: statistics.changedEntries > 0 ? Math.round((statistics.validChanges / statistics.changedEntries) * 100) : 0
      });
    }

    return cards;
  }, [statistics]);

  if (statistics.totalEntries === 0) {
    return null;
  }

  return (
    <div className={cn('apple-show-stats-section', className)}>
      <div className="apple-show-stats-grid">
        {statisticCards.map((card) => (
          <div key={card.id} className="apple-show-stat-card">
            <div className="apple-show-stat-layout">
              <div className={cn('apple-show-stat-icon', card.color)}>
                <card.icon className="w-5 h-5" />
              </div>
              <div className="apple-show-stat-content">
                <div className="apple-show-stat-header">
                  <div className="apple-show-stat-title">{card.title}</div>
                  {card.total && (
                    <div className="apple-show-stat-subtitle">
                      {card.value} of {card.total}
                    </div>
                  )}
                </div>
                <div className="apple-show-stat-number">{card.value}</div>
                {card.percentage !== undefined && (
                  <div className="apple-show-stat-percentage">
                    {card.percentage}%
                  </div>
                )}
              </div>
            </div>
            
            {/* Progress bar */}
            <div className="apple-show-stat-progress">
              <div 
                className={cn('apple-show-stat-progress-bar', card.color)} 
                style={{ width: `${card.percentage || 0}%` }}
              />
            </div>
            
            {/* Description tooltip */}
            <div className="apple-show-stat-description">
              {card.description}
            </div>
          </div>
        ))}
      </div>

      {/* Additional statistics summary */}
      {statistics.entriesWithResults > 0 && (
        <div className="mt-4 p-4 bg-muted/30 rounded-lg">
          <div className="flex justify-between items-center text-sm">
            <div className="space-x-6">
              <span className="text-green-600">
                Q: {statistics.qualifiedEntries}
              </span>
              <span className="text-red-600">
                NQ: {statistics.notQualifiedEntries}
              </span>
              {statistics.absentEntries > 0 && (
                <span className="text-yellow-600">
                  Absent: {statistics.absentEntries}
                </span>
              )}
              {statistics.withdrawnEntries > 0 && (
                <span className="text-gray-600">
                  Withdrawn: {statistics.withdrawnEntries}
                </span>
              )}
            </div>
            <div className="text-muted-foreground">
              Completion: {statistics.completionRate}% • Qualification: {statistics.qualificationRate}%
            </div>
          </div>
        </div>
      )}

      {/* Edit changes alert */}
      {statistics.changedEntries > 0 && (
        <div className={cn(
          'mt-4 p-4 rounded-lg border-l-4',
          statistics.invalidChanges > 0 
            ? 'bg-red-50 border-l-red-500 dark:bg-red-950/20' 
            : 'bg-blue-50 border-l-blue-500 dark:bg-blue-950/20'
        )}>
          <div className="flex items-center space-x-2">
            {statistics.invalidChanges > 0 ? (
              <AlertCircle className="h-5 w-5 text-red-600" />
            ) : (
              <Edit3 className="h-5 w-5 text-blue-600" />
            )}
            <div className="text-sm">
              <span className="font-medium">
                {statistics.validChanges} valid change{statistics.validChanges !== 1 ? 's' : ''} ready to save
              </span>
              {statistics.invalidChanges > 0 && (
                <span className="text-red-600 ml-2">
                  • {statistics.invalidChanges} error{statistics.invalidChanges !== 1 ? 's' : ''} need attention
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};