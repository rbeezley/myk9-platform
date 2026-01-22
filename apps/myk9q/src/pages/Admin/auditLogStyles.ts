/**
 * AuditLog Styles
 *
 * Tailwind CSS classes for the Audit Log admin page.
 */

import { cn } from '@/lib/utils';

export const styles = {
  // Header
  header: cn(
    "px-[var(--token-space-3xl)]",
    "mb-[var(--token-space-3xl)]"
  ),

  headerTop: cn(
    "flex items-center",
    "mb-[var(--token-space-lg)]"
  ),

  headerInfo: cn(
    "flex-1 ml-[var(--token-space-xl)]"
  ),

  headerTitle: cn(
    "flex items-center gap-[var(--token-space-lg)]"
  ),

  headerIcon: cn(
    "w-8 h-8 text-[var(--primary)]"
  ),

  h1: cn(
    "text-[1.875rem] font-bold m-0 text-[var(--foreground)]"
  ),

  headerDescription: cn(
    "text-[var(--muted-foreground)] text-base m-0"
  ),

  // Controls
  controls: cn(
    "flex items-center gap-[var(--token-space-lg)]",
    "px-[var(--token-space-3xl)]",
    "mb-[var(--token-space-2xl)]",
    "flex-wrap"
  ),

  filterToggleBtn: cn(
    "flex items-center gap-[var(--token-space-md)]",
    "px-[var(--token-space-xl)] py-[var(--token-space-md)]",
    "bg-[var(--card)] border-2 border-[var(--border)]",
    "rounded-[var(--token-radius-lg)]",
    "text-[var(--foreground)] text-sm font-semibold",
    "cursor-pointer",
    "transition-all duration-200 ease-in-out",
    "relative",
    "hover:bg-[var(--muted)] hover:border-[var(--primary)]"
  ),

  filterToggleBtnActive: cn(
    "bg-[var(--primary)] border-[var(--primary)] text-[var(--primary-foreground)]"
  ),

  filterBadge: cn(
    "inline-flex items-center justify-center",
    "min-w-[20px] h-5 px-[var(--token-space-sm)]",
    "bg-[var(--primary-foreground)] text-[var(--primary)]",
    "rounded-[10px]",
    "text-xs font-bold"
  ),

  filterBadgeActive: cn(
    "bg-[var(--primary)] text-[var(--primary-foreground)]",
    "outline-2 outline outline-[var(--primary-foreground)]"
  ),

  clearFiltersBtn: cn(
    "flex items-center gap-[var(--token-space-sm)]",
    "px-[var(--token-space-xl)] py-[var(--token-space-md)]",
    "bg-transparent border-2 border-[var(--border)]",
    "rounded-[var(--token-radius-lg)]",
    "text-[var(--muted-foreground)] text-sm",
    "cursor-pointer",
    "transition-all duration-200 ease-in-out",
    "hover:bg-[var(--muted)] hover:border-[var(--destructive)] hover:text-[var(--destructive)]"
  ),

  limitControl: cn(
    "flex items-center gap-[var(--token-space-md)]",
    "ml-auto"
  ),

  limitLabel: cn(
    "text-sm text-[var(--muted-foreground)]"
  ),

  limitSelect: cn(
    "px-[var(--token-space-lg)] py-[var(--token-space-md)]",
    "bg-[var(--card)] border-2 border-[var(--border)]",
    "rounded-[var(--token-radius-lg)]",
    "text-[var(--foreground)] text-sm",
    "cursor-pointer",
    "transition-[border-color] duration-200 ease-in-out",
    "hover:border-[var(--primary)]"
  ),

  // Filter Panel
  filterPanel: cn(
    "px-[var(--token-space-3xl)] py-[var(--token-space-2xl)]",
    "bg-[var(--muted)]",
    "border-t-2 border-b-2 border-[var(--border)]",
    "mb-[var(--token-space-2xl)]"
  ),

  filterGrid: cn(
    "grid gap-[var(--token-space-xl)]",
    "grid-cols-[repeat(auto-fit,minmax(200px,1fr))]",
    "sm:grid-cols-2 lg:grid-cols-4"
  ),

  filterGroup: cn(
    "flex flex-col gap-[var(--token-space-md)]"
  ),

  filterLabel: cn(
    "text-sm font-semibold text-[var(--foreground)]"
  ),

  filterSelect: cn(
    "px-[var(--token-space-lg)] py-[var(--token-space-md)]",
    "bg-[var(--card)] border-2 border-[var(--border)]",
    "rounded-[var(--token-radius-lg)]",
    "text-[var(--foreground)] text-sm",
    "transition-[border-color] duration-200 ease-in-out",
    "focus:outline-none focus:border-[var(--primary)]"
  ),

  filterDateInput: cn(
    "px-[var(--token-space-lg)] py-[var(--token-space-md)]",
    "bg-[var(--card)] border-2 border-[var(--border)]",
    "rounded-[var(--token-radius-lg)]",
    "text-[var(--foreground)] text-sm",
    "transition-[border-color] duration-200 ease-in-out",
    "[color-scheme:dark]",
    "focus:outline-none focus:border-[var(--primary)]"
  ),

  // Table Container
  tableContainer: cn(
    "px-[var(--token-space-3xl)]",
    "overflow-x-auto"
  ),

  // Table
  table: cn(
    "w-full border-collapse",
    "bg-[var(--card)]",
    "border-2 border-[var(--border)]",
    "rounded-[var(--token-radius-xl)]",
    "overflow-hidden"
  ),

  thead: cn(
    "bg-[var(--muted)]",
    "border-b-2 border-[var(--border)]"
  ),

  th: cn(
    "p-[var(--token-space-xl)]",
    "text-left text-sm font-semibold text-[var(--foreground)]"
  ),

  thContent: cn(
    "inline-flex items-center gap-[var(--token-space-md)]"
  ),

  thIcon: cn(
    "w-4 h-4 text-[var(--muted-foreground)]"
  ),

  tr: cn(
    "border-b border-[var(--border)]",
    "transition-colors duration-200 ease-in-out",
    "last:border-b-0",
    "hover:bg-[var(--muted)]"
  ),

  td: cn(
    "p-[var(--token-space-xl)]",
    "text-sm text-[var(--foreground)]",
    "align-top"
  ),

  // Column Widths
  colTimestamp: cn("w-[20%] min-w-[180px]"),
  colAdmin: cn("w-[20%] min-w-[150px]"),
  colScope: cn("w-[15%] min-w-[120px]"),
  colChange: cn("w-[45%]"),

  // Timestamp Cell
  timestampCell: cn(
    "flex flex-col gap-[var(--token-space-sm)]"
  ),

  relativeTime: cn(
    "font-semibold text-[var(--foreground)]"
  ),

  absoluteTime: cn(
    "text-xs text-[var(--muted-foreground)]"
  ),

  // Admin Name
  adminName: cn(
    "font-semibold text-[var(--primary)]"
  ),

  unknownAdmin: cn(
    "italic text-[var(--muted-foreground)] font-normal"
  ),

  // Scope Badge
  scopeBadge: cn(
    "inline-flex",
    "px-[var(--token-space-md)] py-[var(--token-space-sm)]",
    "rounded-[var(--token-radius-md)]",
    "text-xs font-semibold uppercase"
  ),

  scopeShowLevel: cn(
    "bg-[rgba(99,102,241,0.1)] text-[#6366f1] border border-[#6366f1]"
  ),

  scopeTrialLevel: cn(
    "bg-[rgba(139,92,246,0.1)] text-[var(--status-at-gate)] border border-[var(--status-at-gate)]"
  ),

  scopeClassLevel: cn(
    "bg-[rgba(59,130,246,0.1)] text-[var(--checkin-in-ring)] border border-[var(--checkin-in-ring)]"
  ),

  // Change Description
  changeDescription: cn(
    "font-mono text-sm text-[var(--foreground)]"
  ),

  // Footer
  footer: cn(
    "px-[var(--token-space-3xl)] py-[var(--token-space-2xl)]",
    "text-center"
  ),

  footerText: cn(
    "text-[var(--muted-foreground)] text-sm m-0"
  ),

  // Loading State
  loading: cn(
    "flex flex-col items-center justify-center",
    "gap-[var(--token-space-xl)]",
    "p-[var(--token-space-4xl)]"
  ),

  spinner: cn(
    "w-12 h-12",
    "border-4 border-[var(--muted)] border-t-[var(--primary)]",
    "rounded-full",
    "animate-spin"
  ),

  loadingText: cn(
    "text-[var(--muted-foreground)] text-base"
  ),

  // Error State
  error: cn(
    "flex flex-col items-center",
    "gap-[var(--token-space-xl)]",
    "p-[var(--token-space-4xl)]",
    "text-center"
  ),

  errorTitle: cn(
    "text-2xl font-bold text-[var(--destructive)] m-0"
  ),

  errorText: cn(
    "text-[var(--muted-foreground)] text-base m-0"
  ),

  errorButton: cn(
    "px-[var(--token-space-2xl)] py-[var(--token-space-md)]",
    "bg-[var(--primary)] border-none",
    "rounded-[var(--token-radius-lg)]",
    "text-[var(--primary-foreground)] text-sm font-semibold",
    "cursor-pointer",
    "transition-opacity duration-200 ease-in-out",
    "hover:opacity-90"
  ),

  // No Entries State
  noEntries: cn(
    "flex flex-col items-center",
    "gap-[var(--token-space-xl)]",
    "p-[var(--token-space-4xl)]",
    "text-center"
  ),

  noEntriesIcon: cn(
    "w-16 h-16 text-[var(--muted-foreground)] opacity-50"
  ),

  noEntriesText: cn(
    "text-[var(--muted-foreground)] text-base m-0"
  ),

  clearFiltersLink: cn(
    "px-[var(--token-space-2xl)] py-[var(--token-space-md)]",
    "bg-[var(--primary)] border-none",
    "rounded-[var(--token-radius-lg)]",
    "text-[var(--primary-foreground)] text-sm font-semibold",
    "cursor-pointer",
    "transition-opacity duration-200 ease-in-out",
    "hover:opacity-90"
  ),

  // Button icon class
  btnIcon: cn("w-4 h-4"),
};

// Helper to get scope badge style
export function getScopeBadgeStyle(scope: string): string {
  const scopeKey = scope.toLowerCase().replace(' ', '-');
  switch (scopeKey) {
    case 'show-level':
      return cn(styles.scopeBadge, styles.scopeShowLevel);
    case 'trial-level':
      return cn(styles.scopeBadge, styles.scopeTrialLevel);
    case 'class-level':
      return cn(styles.scopeBadge, styles.scopeClassLevel);
    default:
      return styles.scopeBadge;
  }
}
