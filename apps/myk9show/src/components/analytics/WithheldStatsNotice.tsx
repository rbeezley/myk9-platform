import { EyeOff } from 'lucide-react';
import { EmptyState } from '@/components/common/EmptyState';

/**
 * Shown instead of show or judge statistics when some scored results are hidden
 * from this viewer (MYK9-969 results privacy, or not yet released). Totals,
 * rates and fastest times over the visible subset would be wrong, not partial.
 */
export function WithheldStatsNotice() {
  return (
    <EmptyState
      icon={EyeOff}
      title="Statistics not shown"
      description="Some results here are private or not yet released, so totals and fastest times would be wrong."
      action={null}
      size="sm"
    />
  );
}
