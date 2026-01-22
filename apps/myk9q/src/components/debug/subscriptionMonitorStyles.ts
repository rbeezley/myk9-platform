/**
 * SubscriptionMonitor Styles
 *
 * Tailwind CSS classes for the SubscriptionMonitor debug tool.
 * Shared between SubscriptionMonitor.tsx and subscriptionMonitorComponents.tsx.
 */

import { cn } from '@/lib/utils';

export const styles = {
  // Toggle Button (Floating)
  toggle: cn(
    "fixed z-[var(--token-z-toast)]",
    "bottom-[var(--token-space-2xl)] right-[var(--token-space-xl)]",
    "sm:bottom-[var(--token-space-4xl)] sm:right-[var(--token-space-3xl)]",
    "w-12 h-12 rounded-full",
    "bg-[var(--primary)] text-white border-none",
    "shadow-[0_4px_12px_rgba(0,0,0,0.2)]",
    "cursor-pointer flex items-center justify-center",
    "transition-all duration-200 ease-in-out",
    "hover:scale-110 hover:shadow-[0_6px_16px_rgba(0,0,0,0.3)]"
  ),

  leakIndicator: cn(
    "absolute -top-[var(--token-space-sm)] -right-[var(--token-space-sm)]",
    "w-5 h-5 rounded-full",
    "bg-[var(--status-error)] text-white",
    "text-xs font-bold",
    "flex items-center justify-center",
    "animate-pulse"
  ),

  countBadge: cn(
    "absolute -bottom-[var(--token-space-sm)] -right-[var(--token-space-sm)]",
    "min-w-[20px] h-5 px-[var(--token-space-sm)]",
    "rounded-[10px]",
    "bg-[var(--badge-bg)] text-[var(--badge-text)]",
    "text-[11px] font-bold",
    "flex items-center justify-center"
  ),

  // Monitor Panel
  panel: cn(
    "fixed z-[var(--token-z-toast)]",
    "bottom-[var(--token-space-lg)] right-[var(--token-space-lg)]",
    "w-[calc(100vw-var(--token-space-3xl))]",
    "sm:w-[600px] sm:bottom-[var(--token-space-3xl)] sm:right-[var(--token-space-3xl)]",
    "max-h-[80vh]",
    "bg-[var(--background)]",
    "border border-[var(--border)]",
    "rounded-[var(--border-radius-md)]",
    "shadow-[0_8px_24px_rgba(0,0,0,0.15)]",
    "flex flex-col overflow-hidden"
  ),

  // Header
  header: cn(
    "flex items-center justify-between",
    "p-[var(--token-space-xl)]",
    "bg-[var(--card-header-bg)]",
    "border-b border-[var(--border)]"
  ),

  headerLeft: cn(
    "flex items-center gap-[var(--token-space-lg)]"
  ),

  headerTitle: cn(
    "m-0 text-base font-semibold text-[var(--foreground)]"
  ),

  leakWarning: cn(
    "flex items-center gap-[var(--token-space-sm)]",
    "px-[var(--token-space-lg)] py-[var(--token-space-sm)]",
    "bg-[var(--status-error)] text-white",
    "rounded-[var(--border-radius-sm)]",
    "text-xs font-semibold",
    "animate-pulse"
  ),

  headerActions: cn(
    "flex items-center gap-[var(--token-space-md)]"
  ),

  // Buttons
  refreshBtn: cn(
    "p-[var(--token-space-md)]",
    "bg-transparent",
    "border border-[var(--border)]",
    "rounded-[var(--border-radius-sm)]",
    "cursor-pointer",
    "flex items-center gap-[var(--token-space-sm)]",
    "text-xs text-[var(--foreground)]",
    "transition-all duration-200",
    "hover:bg-[var(--hover-bg)]"
  ),

  refreshBtnActive: cn(
    "bg-[var(--primary)] text-white border-[var(--primary)]"
  ),

  actionBtn: cn(
    "p-[var(--token-space-md)]",
    "bg-transparent",
    "border border-[var(--border)]",
    "rounded-[var(--border-radius-sm)]",
    "cursor-pointer",
    "flex items-center gap-[var(--token-space-sm)]",
    "text-xs text-[var(--foreground)]",
    "transition-all duration-200",
    "hover:bg-[var(--hover-bg)]"
  ),

  actionBtnDanger: cn(
    "text-[var(--status-error)] border-[var(--status-error)]",
    "hover:bg-[var(--status-error)] hover:text-white"
  ),

  closeBtn: cn(
    "p-[var(--token-space-md)]",
    "bg-transparent border-none",
    "rounded-[var(--border-radius-sm)]",
    "cursor-pointer",
    "flex items-center",
    "text-[var(--foreground)]",
    "transition-all duration-200",
    "hover:bg-[var(--hover-bg)]"
  ),

  // Content
  content: cn(
    "p-[var(--token-space-xl)]",
    "overflow-y-auto",
    "flex flex-col gap-[var(--token-space-2xl)]"
  ),

  // Health Summary
  healthSummary: cn(
    "grid grid-cols-2",
    "sm:grid-cols-[repeat(auto-fit,minmax(120px,1fr))]",
    "gap-[var(--token-space-lg)]"
  ),

  statCard: cn(
    "p-[var(--token-space-lg)]",
    "bg-[var(--card-bg)]",
    "border border-[var(--border)]",
    "rounded-[var(--border-radius-sm)]",
    "text-center"
  ),

  statLabel: cn(
    "text-[11px] text-[var(--token-text-muted)]",
    "uppercase tracking-[0.5px]",
    "mb-[var(--token-space-sm)]"
  ),

  statValue: cn(
    "text-2xl font-bold text-[var(--foreground)]"
  ),

  statValueWarning: cn(
    "text-[var(--status-warning)]"
  ),

  statSublabel: cn(
    "text-[11px] text-[var(--token-text-muted)]",
    "mt-[var(--token-space-sm)]"
  ),

  // Leak Alert
  leakAlert: cn(
    "flex items-start gap-[var(--token-space-lg)]",
    "p-[var(--token-space-xl)]",
    "bg-[rgba(239,68,68,0.1)]",
    "border border-[var(--status-error)]",
    "rounded-[var(--border-radius-sm)]",
    "text-[var(--status-error)]"
  ),

  leakDetails: cn("flex-1"),

  leakDetailsStrong: cn("block mb-[var(--token-space-sm)]"),

  leakDetailsP: cn("m-0 text-[13px]"),

  // Type Breakdown
  typeBreakdown: cn(""),

  typeBreakdownTitle: cn(
    "m-0 mb-[var(--token-space-lg)]",
    "text-sm font-semibold text-[var(--foreground)]"
  ),

  typeGrid: cn(
    "grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))]",
    "gap-[var(--token-space-md)]"
  ),

  typeItem: cn(
    "flex items-center justify-between",
    "px-[var(--token-space-lg)] py-[var(--token-space-md)]",
    "bg-[var(--card-bg)]",
    "border border-[var(--border)]",
    "rounded-[var(--border-radius-sm)]"
  ),

  typeName: cn("text-xs text-[var(--token-text-secondary)]"),

  typeCount: cn("text-base font-bold text-[var(--foreground)]"),

  // Subscriptions List
  subscriptionsList: cn(""),

  subscriptionsListTitle: cn(
    "m-0 mb-[var(--token-space-lg)]",
    "text-sm font-semibold text-[var(--foreground)]"
  ),

  subscriptionItems: cn(
    "flex flex-col gap-[var(--token-space-md)]",
    "max-h-[300px] overflow-y-auto"
  ),

  subscriptionItem: cn(
    "flex items-center justify-between",
    "p-[var(--token-space-lg)]",
    "bg-[var(--card-bg)]",
    "border border-[var(--border)]",
    "rounded-[var(--border-radius-sm)]",
    "transition-all duration-200",
    "hover:border-[var(--primary)]"
  ),

  subscriptionItemOld: cn(
    "border-[var(--status-warning)]",
    "bg-[rgba(245,158,11,0.05)]"
  ),

  subInfo: cn("flex-1 min-w-0"),

  subKey: cn(
    "text-[13px] font-semibold text-[var(--foreground)]",
    "mb-[var(--token-space-sm)]",
    "overflow-hidden text-ellipsis whitespace-nowrap"
  ),

  subMeta: cn(
    "flex items-center gap-[var(--token-space-md)] flex-wrap"
  ),

  subType: cn(
    "text-[11px] px-[var(--token-space-md)] py-0.5",
    "rounded-[var(--border-radius-sm)]",
    "font-semibold uppercase"
  ),

  subTypeAnnouncement: cn(
    "bg-[rgba(59,130,246,0.1)] text-[var(--checkin-in-ring)]"
  ),

  subTypeNationals: cn(
    "bg-[rgba(139,92,246,0.1)] text-[var(--status-at-gate)]"
  ),

  subTypeEntry: cn(
    "bg-[rgba(16,185,129,0.1)] text-[var(--status-checked-in)]"
  ),

  subTypeSync: cn(
    "bg-[rgba(245,158,11,0.1)] text-[var(--status-conflict)]"
  ),

  subTypeOther: cn(
    "bg-[rgba(107,114,128,0.1)] text-[var(--text-gray)]"
  ),

  subLicense: cn("text-[11px] text-[var(--token-text-muted)]"),

  subAge: cn("text-[11px] text-[var(--token-text-muted)]"),

  subAgeWarning: cn("text-[var(--status-warning)] font-semibold"),

  subRemove: cn(
    "p-[var(--token-space-md)]",
    "bg-transparent",
    "border border-[var(--border)]",
    "rounded-[var(--border-radius-sm)]",
    "cursor-pointer",
    "text-[var(--token-text-muted)]",
    "transition-all duration-200",
    "hover:bg-[var(--status-error)] hover:border-[var(--status-error)] hover:text-white"
  ),

  // Empty State
  emptyState: cn(
    "p-[var(--token-space-4xl)]",
    "text-center text-[var(--token-text-muted)]"
  ),

  emptyStateIcon: cn(
    "text-[var(--status-success)] mb-[var(--token-space-lg)]"
  ),

  emptyStateText: cn("m-0 text-sm"),

  // Cleanup History
  cleanupHistory: cn(""),

  cleanupHistoryTitle: cn(
    "m-0 mb-[var(--token-space-lg)]",
    "text-sm font-semibold text-[var(--foreground)]"
  ),

  historyItems: cn(
    "flex flex-col gap-[var(--token-space-md)]",
    "max-h-[200px] overflow-y-auto"
  ),

  historyItem: cn(
    "flex items-center gap-[var(--token-space-lg)]",
    "px-[var(--token-space-lg)] py-[var(--token-space-md)]",
    "bg-[var(--card-bg)]",
    "border border-[var(--border)]",
    "rounded-[var(--border-radius-sm)]",
    "text-xs"
  ),

  historyTime: cn(
    "text-[var(--token-text-muted)] min-w-[80px]"
  ),

  historyCount: cn(
    "text-[var(--foreground)] font-semibold"
  ),

  historyRoute: cn(
    "text-[var(--token-text-secondary)]",
    "flex-1 overflow-hidden text-ellipsis whitespace-nowrap"
  ),

  // Animation classes
  spinning: cn("animate-spin"),
};

// Helper to get subscription type style
export function getSubTypeStyle(type: string): string {
  switch (type) {
    case 'announcement':
      return cn(styles.subType, styles.subTypeAnnouncement);
    case 'nationals':
      return cn(styles.subType, styles.subTypeNationals);
    case 'entry':
      return cn(styles.subType, styles.subTypeEntry);
    case 'sync':
      return cn(styles.subType, styles.subTypeSync);
    default:
      return cn(styles.subType, styles.subTypeOther);
  }
}
