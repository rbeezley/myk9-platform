/**
 * ClassOptionsDialog
 *
 * Reusable dialog showing class action options in a grid layout.
 * Used by ClassList and EntryList pages.
 */

import React from 'react';
import {
  List,
  ClipboardList,
  Clock,
  Settings,
  BarChart3,
  FileText,
  Award,
  Activity
} from 'lucide-react';
import { DialogContainer } from './DialogContainer';
import { cn } from '@/lib/utils';
import './shared-dialog.css';

/** Tailwind styles for ClassOptionsDialog */
const styles = {
  grid: cn(
    "grid gap-[var(--token-space-lg)]",
    "sm:grid-cols-2"
  ),
  item: cn(
    "grid grid-cols-[48px_1fr] grid-rows-[auto_auto]",
    "gap-x-[var(--token-space-lg)] gap-y-[var(--token-space-sm)]",
    "p-[var(--token-space-xl)]",
    "bg-white dark:bg-[var(--card)]",
    "border border-[var(--border)] rounded-[10px]",
    "cursor-pointer text-left font-inherit",
    "transition-all duration-300 ease-[cubic-bezier(0.25,0.46,0.45,0.94)]",
    "hover:-translate-y-0.5 hover:border-[var(--primary)]",
    "hover:shadow-[0_var(--token-space-sm)_var(--token-space-lg)_rgba(0,0,0,0.15)]",
    "dark:hover:bg-[var(--border)] dark:hover:shadow-[0_var(--token-space-sm)_var(--token-space-lg)_rgba(0,0,0,0.4)]",
    "active:-translate-y-[1px] active:transition-[transform] active:duration-100",
    "motion-reduce:transition-none motion-reduce:hover:translate-y-0"
  ),
  icon: cn(
    "col-start-1 row-start-1",
    "flex items-center justify-center",
    "w-12 h-12 rounded-[var(--token-space-lg)]",
    "text-white shrink-0",
    "[&_svg]:w-5 [&_svg]:h-5 [&_svg]:stroke-2"
  ),
  iconPrimary: "bg-[var(--primary)]",
  iconAccent: "bg-[var(--status-start-time)]",
  iconMuted: "bg-[var(--text-gray)] dark:bg-[var(--text-light-gray)]",
  iconSuccess: "bg-[var(--token-success)]",
  iconWarning: "bg-[var(--token-warning)]",
  iconSecondary: "bg-[var(--status-at-gate)]",
  iconInfo: "bg-[var(--status-in-progress)]",
  label: cn(
    "col-start-2 row-start-1",
    "flex items-center",
    "font-semibold text-base leading-tight m-0",
    "text-[var(--foreground)] dark:text-[var(--token-text-white)]"
  ),
  description: cn(
    "col-span-full row-start-2",
    "text-[var(--token-space-lg)] leading-tight m-0",
    "text-[var(--muted-foreground)] dark:text-[var(--token-text-muted)]"
  ),
};

export interface ClassOptionsData {
  id: string;
  element: string;
  level: string;
  class_name: string;
  entry_count?: number;
  completed_count?: number;
  class_status?: string;
  briefing_time?: string;
  break_until_time?: string;
  start_time?: string;
}

export interface ClassOptionsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  classData: ClassOptionsData | null;
  /** Called when Requirements is clicked */
  onRequirements?: () => void;
  /** Called when Set Max Time is clicked */
  onSetMaxTime?: () => void;
  /** Called when Settings is clicked */
  onSettings?: () => void;
  /** Called when Statistics is clicked. Returns false to prevent close (e.g., show warning) */
  onStatistics?: () => boolean | void;
  /** Called when Status is clicked */
  onStatus?: () => void;
  /** Called when Check-In Sheet is clicked */
  onPrintCheckIn?: () => void;
  /** Called when Results Sheet is clicked */
  onPrintResults?: () => void;
  /** Called when Scoresheet is clicked */
  onPrintScoresheet?: () => void;
  /** Hide options that aren't available */
  hideRequirements?: boolean;
  hideMaxTime?: boolean;
  hideSettings?: boolean;
  hideStatistics?: boolean;
  hideStatus?: boolean;
  hidePrintOptions?: boolean;
}

export const ClassOptionsDialog: React.FC<ClassOptionsDialogProps> = ({
  isOpen,
  onClose,
  classData,
  onRequirements,
  onSetMaxTime,
  onSettings,
  onStatistics,
  onStatus,
  onPrintCheckIn,
  onPrintResults,
  onPrintScoresheet,
  hideRequirements = false,
  hideMaxTime = false,
  hideSettings = false,
  hideStatistics = false,
  hideStatus = false,
  hidePrintOptions = false,
}) => {
  const handleOptionClick = (callback?: () => boolean | void) => {
    if (callback) {
      const result = callback();
      // If callback returns false, don't close
      if (result === false) return;
    }
    onClose();
  };

  // Don't render if no class data
  if (!classData) return null;

  return (
    <DialogContainer
      isOpen={isOpen}
      onClose={onClose}
      title="Class Options"
      icon={<List className="title-icon" />}
    >
      {/* Class Info Header */}
      <div className="class-info-header">
        <h3 className="class-title">{classData.class_name}</h3>
      </div>
      <div className={styles.grid}>
        {/* Requirements */}
        {!hideRequirements && onRequirements && (
          <button
            className={styles.item}
            onClick={() => handleOptionClick(onRequirements)}
          >
            <div className={cn(styles.icon, styles.iconPrimary)}>
              <ClipboardList size={20} />
            </div>
            <div className={styles.label}>Requirements</div>
            <div className={styles.description}>View class rules and requirements</div>
          </button>
        )}

        {/* Set Max Time */}
        {!hideMaxTime && onSetMaxTime && (
          <button
            className={styles.item}
            onClick={() => handleOptionClick(onSetMaxTime)}
          >
            <div className={cn(styles.icon, styles.iconAccent)}>
              <Clock size={20} />
            </div>
            <div className={styles.label}>Set Max Time</div>
            <div className={styles.description}>Configure maximum time limits</div>
          </button>
        )}

        {/* Settings */}
        {!hideSettings && onSettings && (
          <button
            className={styles.item}
            onClick={() => handleOptionClick(onSettings)}
          >
            <div className={cn(styles.icon, styles.iconMuted)}>
              <Settings size={20} />
            </div>
            <div className={styles.label}>Settings</div>
            <div className={styles.description}>Configure class settings</div>
          </button>
        )}

        {/* Statistics */}
        {!hideStatistics && onStatistics && (
          <button
            className={styles.item}
            onClick={() => handleOptionClick(onStatistics)}
          >
            <div className={cn(styles.icon, styles.iconSuccess)}>
              <BarChart3 size={20} />
            </div>
            <div className={styles.label}>Statistics</div>
            <div className={styles.description}>View class performance data</div>
          </button>
        )}

        {/* Status */}
        {!hideStatus && onStatus && (
          <button
            className={styles.item}
            onClick={() => handleOptionClick(onStatus)}
          >
            <div className={cn(styles.icon, styles.iconInfo)}>
              <Activity size={20} />
            </div>
            <div className={styles.label}>Status</div>
            <div className={styles.description}>Update class status</div>
          </button>
        )}

        {/* Print Options */}
        {!hidePrintOptions && (
          <>
            {onPrintCheckIn && (
              <button
                className={styles.item}
                onClick={() => handleOptionClick(onPrintCheckIn)}
              >
                <div className={cn(styles.icon, styles.iconWarning)}>
                  <FileText size={20} />
                </div>
                <div className={styles.label}>Check-In Sheet</div>
                <div className={styles.description}>Print check-in roster</div>
              </button>
            )}

            {onPrintResults && (
              <button
                className={styles.item}
                onClick={() => handleOptionClick(onPrintResults)}
              >
                <div className={cn(styles.icon, styles.iconSecondary)}>
                  <Award size={20} />
                </div>
                <div className={styles.label}>Results Sheet</div>
                <div className={styles.description}>Print results report</div>
              </button>
            )}

            {onPrintScoresheet && (
              <button
                className={styles.item}
                onClick={() => handleOptionClick(onPrintScoresheet)}
              >
                <div className={cn(styles.icon, styles.iconPrimary)}>
                  <ClipboardList size={20} />
                </div>
                <div className={styles.label}>Scoresheet</div>
                <div className={styles.description}>Print judge scoresheet</div>
              </button>
            )}
          </>
        )}
      </div>
    </DialogContainer>
  );
};

export default ClassOptionsDialog;
