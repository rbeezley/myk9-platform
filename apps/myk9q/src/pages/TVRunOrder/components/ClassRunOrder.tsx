import React, { useMemo } from 'react';
import { Calendar, Target, User, ClipboardCheck } from 'lucide-react';
import { ClassInfo, EntryInfo } from '../hooks/useTVData';
import { TVEntryCard } from './TVEntryCard';
import { cn } from '@/lib/utils';

/** Tailwind styles for ClassRunOrder */
const styles = {
  container: cn(
    "bg-[var(--card)] border border-[var(--border)] rounded-2xl",
    "flex flex-col overflow-hidden",
    "shadow-[0_var(--token-space-xs)_var(--token-space-md)_rgba(0,0,0,0.1)]",
    "dark:shadow-[0_var(--token-space-xs)_var(--token-space-md)_rgba(0,0,0,0.3)]"
  ),
  header: cn(
    "p-[var(--token-space-xl)]",
    "bg-[var(--muted)] border-b-[var(--token-space-xs)] border-b-[var(--border)]"
  ),
  titleRow: cn(
    "flex items-center gap-[var(--token-space-lg)]",
    "mb-[var(--token-space-md)] flex-wrap"
  ),
  title: cn(
    "text-xl lg:text-2xl font-semibold m-0",
    "text-[var(--foreground)] leading-[1.2]"
  ),
  statusBadge: cn(
    "inline-flex items-center",
    "px-[var(--token-space-lg)] py-[var(--token-space-sm)]",
    "rounded-lg text-xs font-bold uppercase tracking-[0.5px] whitespace-nowrap"
  ),
  statusInProgress: cn(
    "bg-[var(--status-in-progress)] text-[var(--status-in-progress-text)]",
    "animate-[pulse_2s_ease-in-out_infinite]"
  ),
  statusBriefing: "bg-[var(--status-briefing)] text-[var(--status-briefing-text)]",
  statusStarts: "bg-[var(--status-start-time)] text-[var(--status-start-time-text)]",
  statusUpcoming: "bg-[var(--status-setup)] text-[var(--status-setup-text)]",
  meta: cn(
    "text-sm text-[var(--muted-foreground)] font-medium",
    "flex gap-[var(--token-space-lg)] flex-wrap",
    "flex-col items-start lg:flex-row lg:items-center"
  ),
  metaItem: "flex items-center gap-[var(--token-space-sm)] [&_svg]:flex-shrink-0 [&_svg]:opacity-70",
  entries: cn(
    "flex-1 overflow-y-auto p-[var(--token-space-lg)]",
    "flex flex-col gap-[var(--token-space-md)]",
    "[&::-webkit-scrollbar]:w-1.5",
    "[&::-webkit-scrollbar-track]:bg-transparent",
    "[&::-webkit-scrollbar-thumb]:bg-[var(--border)] [&::-webkit-scrollbar-thumb]:rounded-[3px]",
    "[&::-webkit-scrollbar-thumb:hover]:bg-[var(--muted-foreground)]"
  ),
  separator: cn(
    "my-[var(--token-space-md)] border-0",
    "border-t-[var(--token-space-xs)] border-dashed border-t-[var(--border)]",
    "opacity-50"
  ),
  empty: cn(
    "py-[var(--token-space-4xl)] px-[var(--token-space-xl)]",
    "text-center text-[var(--muted-foreground)]",
    "[&_p]:m-0 [&_p]:text-lg"
  ),
};

interface ClassRunOrderProps {
  classInfo: ClassInfo;
  entries: EntryInfo[];
}

export const ClassRunOrder: React.FC<ClassRunOrderProps> = ({ classInfo, entries }) => {
  // Helper function to get display text for result status
  const getResultText = (resultStatus?: string): string | undefined => {
    if (!resultStatus) return undefined;
    const statusMap: Record<string, string> = {
      'q': 'Qualified',
      'qualified': 'Qualified',
      'nq': 'NQ',
      'absent': 'Absent',
      'excused': 'Excused',
      'withdrawn': 'Withdrawn'
    };
    return statusMap[resultStatus.toLowerCase()] || resultStatus;
  };

  // Helper function to get status badge text and style
  const getStatusBadge = () => {
    const status = classInfo.class_status;
    const startTime = classInfo.start_time;

    if (status === 'in_progress') {
      return { text: 'IN PROGRESS', style: styles.statusInProgress };
    } else if (status === 'briefing') {
      return { text: 'BRIEFING NOW', style: styles.statusBriefing };
    } else if (status === 'start_time') {
      if (startTime) {
        // Format time as HH:MM
        const timeStr = startTime.substring(0, 5); // Gets HH:MM from HH:MM:SS
        return { text: `STARTS ${timeStr}`, style: styles.statusStarts };
      } else {
        return { text: 'UPCOMING', style: styles.statusUpcoming };
      }
    } else if (status === 'setup') {
      return { text: 'UPCOMING', style: styles.statusUpcoming };
    }
    return null;
  };

  const statusBadge = getStatusBadge();

  // Sort entries: In-ring first, then pending (by run order), then completed
  const sortedEntries = useMemo(() => {
    return [...entries].sort((a, b) => {
      // Priority 1: In-ring entries at top
      const aInRing = a.status === 'in_ring';
      const bInRing = b.status === 'in_ring';
      if (aInRing && !bInRing) return -1;
      if (!aInRing && bInRing) return 1;

      // Priority 2: Pending before completed
      const aScored = a.status === 'completed';
      const bScored = b.status === 'completed';
      if (!aScored && bScored) return -1;
      if (aScored && !bScored) return 1;

      // Priority 3: Sort by run order (sort_order field or armband)
      // Note: sort_order in TV data might map to exhibitorOrder in Entry interface
      const aOrder = parseInt(a.sort_order || a.armband || '0');
      const bOrder = parseInt(b.sort_order || b.armband || '0');
      return aOrder - bOrder;
    });
  }, [entries]);

  // Separate into pending and completed sections
  const pendingEntries = sortedEntries.filter(e => e.status !== 'completed');
  const completedEntries = sortedEntries.filter(e => e.status === 'completed');

  // Build class display name
  const className = classInfo.class_name || `${classInfo.element_type} ${classInfo.level || ''}`.trim();

  // Format trial date for display (e.g., "Sat, Sep 16, 2023" from "2023-09-16")
  const formatTrialDate = (dateStr: string): string => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className={styles.container}>
      {/* Class header */}
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <h2 className={styles.title}>{className}</h2>
          {statusBadge && (
            <span className={cn(styles.statusBadge, statusBadge.style)}>
              {statusBadge.text}
            </span>
          )}
        </div>
        <div className={styles.meta}>
          <span className={styles.metaItem}><Calendar size={14} /> {formatTrialDate(classInfo.trial_date)}</span>
          <span className={styles.metaItem}><Target size={14} /> Trial {classInfo.trial_number}</span>
          <span className={styles.metaItem}><User size={14} /> {classInfo.judge_name || 'TBD'}</span>
          <span className={styles.metaItem}><ClipboardCheck size={14} /> {classInfo.entry_completed_count || 0} of {classInfo.entry_total_count || 0} scored</span>
        </div>
      </div>

      {/* Entry list */}
      <div className={styles.entries}>
        {/* Pending entries */}
        {pendingEntries.map((entry) => {
          const hasRealSection = entry.section && entry.section !== '-' && entry.section.trim() !== '';
          return (
            <TVEntryCard
              key={entry.id}
              armband={parseInt(entry.armband)}
              callName={entry.dog_name}
              breed={entry.breed}
              handler={entry.handler_name}
              isScored={entry.status === 'completed'}
              inRing={entry.status === 'in_ring'}
              resultText={getResultText(entry.result_status)}
              sectionBadge={hasRealSection ? (entry.section as 'A' | 'B') : undefined}
              checkinStatus={entry.checkin_status}
            />
          );
        })}

        {/* Separator if there are both pending and completed */}
        {pendingEntries.length > 0 && completedEntries.length > 0 && (
          <hr className={styles.separator} />
        )}

        {/* Completed entries */}
        {completedEntries.map((entry) => {
          const hasRealSection = entry.section && entry.section !== '-' && entry.section.trim() !== '';
          return (
            <TVEntryCard
              key={entry.id}
              armband={parseInt(entry.armband)}
              callName={entry.dog_name}
              breed={entry.breed}
              handler={entry.handler_name}
              isScored={entry.status === 'completed'}
              inRing={false}
              resultText={getResultText(entry.result_status)}
              sectionBadge={hasRealSection ? (entry.section as 'A' | 'B') : undefined}
              checkinStatus={entry.checkin_status}
            />
          );
        })}

        {/* Empty state */}
        {entries.length === 0 && (
          <div className={styles.empty}>
            <p>No entries for this class</p>
          </div>
        )}
      </div>
    </div>
  );
};
