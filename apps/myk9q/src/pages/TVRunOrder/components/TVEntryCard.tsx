import React from 'react';
import { cn } from '@/lib/utils';

/** Tailwind styles for TVEntryCard */
const styles = {
  card: cn(
    "bg-[var(--card)] border border-[var(--border)] rounded-xl",
    "p-[var(--token-space-lg)] lg:p-[var(--token-space-md)]",
    "flex items-center gap-[var(--token-space-lg)]",
    "min-h-[60px] transition-all duration-200"
  ),
  cardScored: cn(
    "border-l-[3px] border-l-[var(--status-checked-in)] dark:border-l-emerald-400",
    "opacity-70"
  ),
  cardInRing: cn(
    "bg-[var(--primary-subtle)] border-l-[3px] border-l-[var(--primary)]",
    "animate-[tvEntryPulse_2s_ease-in-out_infinite]"
  ),
  armband: cn(
    "shrink-0 w-11 h-11 min-w-[44px] min-h-[44px]",
    "lg:w-12 lg:h-12 lg:min-w-[48px] lg:min-h-[48px]",
    "bg-[var(--primary)] rounded-xl",
    "flex items-center justify-center",
    "text-lg lg:text-xl font-bold text-white",
    "border-2 border-white/20",
    "shadow-[0_var(--token-space-xs)_var(--token-space-sm)_rgba(0,0,0,0.15)]"
  ),
  sectionBadge: cn(
    "shrink-0 w-7 h-7 rounded-full",
    "flex items-center justify-center",
    "text-sm font-bold text-white",
    "shadow-[0_var(--token-space-xs)_var(--token-space-sm)_rgba(0,0,0,0.1)]"
  ),
  sectionA: "bg-[var(--primary)]",
  sectionB: "bg-[var(--token-accent)]",
  info: "flex-1 min-w-0",
  dog: cn(
    "text-base lg:text-lg font-semibold",
    "m-0 mb-[var(--token-space-sm)]",
    "whitespace-nowrap overflow-hidden text-ellipsis",
    "text-[var(--foreground)]"
  ),
  handler: cn(
    "text-sm lg:text-base",
    "text-[var(--muted-foreground)]",
    "whitespace-nowrap overflow-hidden text-ellipsis"
  ),
  status: cn(
    "shrink-0 flex items-center",
    "gap-[var(--token-space-md)] text-base"
  ),
  inRingBadge: cn(
    "bg-[var(--primary)] text-white",
    "py-[var(--token-space-sm)] px-[var(--token-space-lg)]",
    "rounded-md font-semibold text-sm whitespace-nowrap"
  ),
  resultBadge: cn(
    "py-[var(--token-space-sm)] px-[var(--token-space-md)]",
    "rounded-md font-semibold text-sm whitespace-nowrap"
  ),
  resultQ: "bg-[var(--status-checked-in)] dark:bg-emerald-400 text-white",
  resultNQ: "bg-[var(--muted)] text-[var(--muted-foreground)]",
  resultOther: "bg-[var(--muted)] text-[var(--muted-foreground)]",
  checkinBadge: cn(
    "py-[var(--token-space-sm)] px-[var(--token-space-md)]",
    "rounded-md font-semibold text-sm whitespace-nowrap"
  ),
  checkin0: "bg-[var(--status-no-status)] text-[var(--status-no-status-text)]",
  checkin1: "bg-[var(--status-checked-in)] text-[var(--status-checked-in-text)]",
  checkin2: "bg-[var(--status-conflict)] text-[var(--status-conflict-text)]",
  checkin3: "bg-[var(--status-pulled)] text-[var(--status-pulled-text)]",
  checkin4: "bg-[var(--status-at-gate)] text-[var(--status-at-gate-text)]",
};

interface TVEntryCardProps {
  armband: number;
  callName: string;
  breed?: string;
  handler: string;
  isScored: boolean;
  inRing: boolean;
  resultText?: string;
  sectionBadge?: 'A' | 'B';
  checkinStatus?: number;
}

export const TVEntryCard: React.FC<TVEntryCardProps> = ({
  armband,
  callName,
  breed,
  handler,
  isScored,
  inRing,
  resultText,
  sectionBadge,
  checkinStatus
}) => {
  // Map check-in status codes to display text
  const getCheckinStatusText = (status?: number): string => {
    if (status === undefined || status === null) return 'Not Checked In';
    switch (status) {
      case 0: return 'Not Checked In';
      case 1: return 'Checked In';
      case 2: return 'Conflict';
      case 3: return 'Pulled';
      case 4: return 'At Gate';
      default: return 'Not Checked In';
    }
  };

  // Get check-in status style
  const getCheckinStatusStyle = (status?: number): string => {
    switch (status) {
      case 1: return styles.checkin1;
      case 2: return styles.checkin2;
      case 3: return styles.checkin3;
      case 4: return styles.checkin4;
      default: return styles.checkin0;
    }
  };

  // Get result badge style
  const getResultStyle = (result?: string): string => {
    const lower = result?.toLowerCase();
    if (lower === 'q' || lower === 'qualified') return styles.resultQ;
    if (lower === 'nq' || lower === 'non-qualifying') return styles.resultNQ;
    return styles.resultOther;
  };

  return (
    <div className={cn(
      styles.card,
      isScored && styles.cardScored,
      inRing && styles.cardInRing
    )}>
      {/* Armband badge */}
      <div className={styles.armband}>
        {armband}
      </div>

      {/* Section badge (for Novice A/B) */}
      {sectionBadge && (
        <div className={cn(
          styles.sectionBadge,
          sectionBadge === 'A' ? styles.sectionA : styles.sectionB
        )}>
          {sectionBadge}
        </div>
      )}

      {/* Entry info */}
      <div className={styles.info}>
        <div className={styles.dog}>
          {callName}{breed ? ` · ${breed}` : ''}
        </div>
        <div className={styles.handler}>
          {handler}
        </div>
      </div>

      {/* Status indicators - priority: scored > in-ring > check-in */}
      <div className={styles.status}>
        {isScored && resultText ? (
          /* Show result after scoring */
          <span className={cn(styles.resultBadge, getResultStyle(resultText))}>
            {resultText}
          </span>
        ) : inRing ? (
          /* Show in-ring during judging */
          <span className={styles.inRingBadge}>In Ring</span>
        ) : (
          /* Show check-in status before judging */
          <span className={cn(styles.checkinBadge, getCheckinStatusStyle(checkinStatus))}>
            {getCheckinStatusText(checkinStatus)}
          </span>
        )}
      </div>
    </div>
  );
};
