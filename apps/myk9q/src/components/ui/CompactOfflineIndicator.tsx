/**
 * Compact Offline Status Indicator
 *
 * A small, non-intrusive icon that displays next to the hamburger menu
 * showing offline/sync status. Click to expand detailed sync status popover.
 *
 * States:
 * - Online (synced): Green wifi icon
 * - Online (stale data): Orange clock icon
 * - Online (sync failed): Red warning icon
 * - Offline: Orange wifi-off icon
 * - Pending: Blue cloud icon with badge
 * - Syncing: Blue cloud-upload icon (spinning)
 *
 * Click to expand: Shows detailed sync status with "Sync Now" button
 */

import { SyncStatusPopover } from './SyncStatusPopover';

interface CompactOfflineIndicatorProps {
  /** Optional additional className */
  className?: string;
}

/**
 * CompactOfflineIndicator now wraps SyncStatusPopover for click-to-expand behavior.
 * All existing usages automatically get the enhanced sync status popover.
 */
export function CompactOfflineIndicator({ className = '' }: CompactOfflineIndicatorProps) {
  return <SyncStatusPopover className={className} />;
}

export default CompactOfflineIndicator;
