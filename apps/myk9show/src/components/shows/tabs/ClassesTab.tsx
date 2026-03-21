import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { MineToggle } from '@/components/common/MineToggle';
import { EmptyState } from '@/components/common/EmptyState';
import { useViewPreference, CARD_TABLE_MODES } from '@/hooks/useViewPreference';
import { ViewToggle } from '@/components/common/ViewToggle';
import { ClassCard } from './ClassCard';
import { Search, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getClassStatusDisplay,
  getClassStatusBadgeClasses,
  getClassDisplayStatus,
  type ClassStatusValue,
  type ClassDisplayStatus,
} from '@myk9/core';
import { StatusFilter, type StatusFilterValue } from '@/components/common/StatusFilter';
import { FilterEmptyState } from '@/components/common/FilterEmptyState';
import { parseLocalDateString } from '@/utils/dateLocal';
import { compareLevels } from '@/utils/schedule-summary';

interface ClassInfo {
  id: string;
  name: string;
  element: string;
  level: string;
  section: string;
  judgeName: string;
  trialId: string;
  time: string;
  ring: number;
  status: ClassStatusValue;
  entryCount: number;
  scoredCount?: number;
  isScoringFinalized?: boolean;
  hasActiveEntries?: boolean;
  userHasEntry: boolean;
  trialDate?: string;
  trialNumber?: string;
  trialName?: string;
}

interface ClassesTabProps {
  classes: ClassInfo[];
  showId: string;
  userHasEntries: boolean;
  hideRing?: boolean;
}

function formatTrialDate(dateStr: string): string {
  const date = parseLocalDateString(dateStr);
  if (!date) return dateStr;
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function ClassesTab({ classes, showId, userHasEntries, hideRing = false }: ClassesTabProps) {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useViewPreference('classes', 'table');
  const [isMine, setIsMine] = useState(userHasEntries);
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>('all');

  const mineCount = useMemo(() => classes.filter(c => c.userHasEntry).length, [classes]);
  const mineFilteredClasses = useMemo(
    () => (isMine ? classes.filter(c => c.userHasEntry) : classes),
    [classes, isMine],
  );

  const classDisplayStatuses = useMemo(() => {
    const map = new Map<string, ClassDisplayStatus>();
    for (const cls of mineFilteredClasses) {
      const input: Parameters<typeof getClassDisplayStatus>[0] = {
        status: cls.status,
        entry_count: cls.entryCount,
        scored_count: cls.scoredCount ?? 0,
      };
      if (cls.isScoringFinalized !== undefined) input.is_scoring_finalized = cls.isScoringFinalized;
      if (cls.hasActiveEntries !== undefined) input.has_active_entries = cls.hasActiveEntries;
      map.set(cls.id, getClassDisplayStatus(input));
    }
    return map;
  }, [mineFilteredClasses]);

  const statusCounts = useMemo(() => {
    let pending = 0;
    let completed = 0;
    for (const ds of classDisplayStatuses.values()) {
      if (ds === 'completed') completed++;
      else pending++;
    }
    return { all: mineFilteredClasses.length, pending, completed };
  }, [mineFilteredClasses, classDisplayStatuses]);

  const filteredClasses = useMemo(() => {
    if (statusFilter === 'all') return mineFilteredClasses;
    return mineFilteredClasses.filter(cls => {
      const ds = classDisplayStatuses.get(cls.id) ?? 'not-started';
      if (statusFilter === 'completed') return ds === 'completed';
      return ds !== 'completed'; // pending = not-started + in-progress
    });
  }, [mineFilteredClasses, statusFilter, classDisplayStatuses]);

  // Group classes by trial (date + number)
  const groupedByTrial = useMemo(() => {
    const groups = new Map<string, { label: string; classes: ClassInfo[] }>();
    for (const cls of filteredClasses) {
      const key = `${cls.trialDate || ''}|${cls.trialNumber || ''}`;
      if (!groups.has(key)) {
        const datePart = cls.trialDate ? formatTrialDate(cls.trialDate) : '';
        const trialPart = cls.trialName || (cls.trialNumber ? `Trial ${cls.trialNumber}` : '');
        const label = [datePart, trialPart].filter(Boolean).join(' — ');
        groups.set(key, { label: label || 'Unassigned', classes: [] });
      }
      groups.get(key)!.classes.push(cls);
    }
    // Sort classes within each group by element, then level progression
    for (const group of groups.values()) {
      group.classes.sort((a, b) => {
        const elemCmp = a.element.localeCompare(b.element);
        if (elemCmp !== 0) return elemCmp;
        return compareLevels(a.level, b.level);
      });
    }
    return Array.from(groups.values());
  }, [filteredClasses]);

  const hasMultipleTrials = groupedByTrial.length > 1;

  // Compute column count dynamically so colSpan stays in sync
  // Base: Element, Level, Judge, Time, Status, Entries, Chevron = 7
  const totalColumns = 7 + (hideRing ? 0 : 1);

  if (classes.length === 0) {
    return (
      <EmptyState
        icon={Search}
        title="No classes scheduled"
        description="Classes for this show haven't been set up yet."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <StatusFilter
            filter={statusFilter}
            onFilterChange={setStatusFilter}
            counts={statusCounts}
          />
          <MineToggle
            isMine={isMine}
            onToggle={() => setIsMine(!isMine)}
            allLabel="All Classes"
            mineLabel="My Classes"
            allCount={classes.length}
            mineCount={mineCount}
            hidden={!userHasEntries}
          />
        </div>
        <ViewToggle
          modes={CARD_TABLE_MODES}
          active={viewMode}
          onChange={setViewMode as (key: string) => void}
        />
      </div>

      {filteredClasses.length === 0 && classes.length > 0 ? (
        <FilterEmptyState
          noun="classes"
          statusFilter={statusFilter}
          onReset={() => setStatusFilter('all')}
        />
      ) : viewMode === 'table' ? (
        <div className="rounded-xl border border-border/50 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/30 border-b border-border/30">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Element</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Level</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">
                  Judge
                </th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">
                  Time
                </th>
                {!hideRing && (
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">
                    Ring
                  </th>
                )}
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">
                  Entries
                </th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {groupedByTrial.map(group => (
                <React.Fragment key={group.label}>
                  {hasMultipleTrials && (
                    <tr className="bg-muted/20">
                      <td
                        colSpan={totalColumns}
                        className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                      >
                        {group.label}
                      </td>
                    </tr>
                  )}
                  {group.classes.map(cls => {
                    const statusDisplay = getClassStatusDisplay(cls.status);
                    return (
                      <tr
                        key={cls.id}
                        role="button"
                        tabIndex={0}
                        className="border-b border-border/20 hover:bg-muted/10 transition-colors cursor-pointer"
                        onClick={() =>
                          navigate(`/shows/${showId}/trials/${cls.trialId}/classes/${cls.id}`)
                        }
                        onKeyDown={e => {
                          if (e.key === 'Enter')
                            navigate(`/shows/${showId}/trials/${cls.trialId}/classes/${cls.id}`);
                        }}
                      >
                        <td className="px-4 py-3 font-medium">{cls.element}</td>
                        <td className="px-4 py-3">
                          {cls.level}
                          {cls.section && (
                            <span className="ml-1 text-muted-foreground">{cls.section}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">
                          {cls.judgeName || 'TBD'}
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">{cls.time}</td>
                        {!hideRing && (
                          <td className="px-4 py-3 hidden sm:table-cell">{cls.ring}</td>
                        )}
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              'px-2 py-0.5 rounded text-xs font-medium',
                              getClassStatusBadgeClasses(cls.status),
                            )}
                          >
                            {statusDisplay.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground">
                          {cls.entryCount}
                        </td>
                        <td className="px-2 py-3 text-muted-foreground/50">
                          <ChevronRight className="h-4 w-4" />
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        groupedByTrial.map(group => (
          <div key={group.label} className="space-y-3">
            {hasMultipleTrials && (
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
                {group.label}
              </h3>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {group.classes.map(cls => (
                <ClassCard
                  key={cls.id}
                  classInfo={cls}
                  hideRing={hideRing}
                  onClick={() =>
                    navigate(`/shows/${showId}/trials/${cls.trialId}/classes/${cls.id}`)
                  }
                />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
