import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ShowDeskActionable } from '@/features/show-map/showDeskActionable';

interface ActionableBadgeProps {
  count?: ShowDeskActionable['count'] | undefined;
  tone?: ShowDeskActionable['tone'] | undefined;
  incomplete?: boolean | undefined;
  className?: string | undefined;
  'data-testid'?: string;
}

/**
 * The attention glance for the show tools: how many things are waiting, in what tone, and
 * whether the count is a floor. Rendered on the header Actions trigger (MYK9-1262).
 *
 * Urgent is alarming (red), routine is ambient, unknown is "unchecked" (warning border, `?`).
 * Nothing waiting with every source read renders nothing. An unread source must never read as
 * calm during an outage, which is why `incomplete` with nothing counted shows `?`, not nothing.
 */
export function ActionableBadge({
  count,
  tone = 'urgent',
  incomplete = false,
  className,
  'data-testid': testId = 'actionable-badge',
}: ActionableBadgeProps) {
  const hasActionable = typeof count === 'number' && count > 0;
  const signalsUnknown = incomplete && !hasActionable;
  if (!hasActionable && !signalsUnknown) return null;

  const value = hasActionable ? count : '?';
  const label = hasActionable
    ? `${count} ${count === 1 ? 'item needs' : 'items need'} attention${
        incomplete ? ', and some could not be checked' : ''
      }`
    : 'Cannot check whether anything needs attention';
  const variant = !hasActionable ? 'outline' : tone === 'urgent' ? 'destructive' : 'secondary';
  const dataTone = hasActionable ? tone : 'unknown';

  return (
    <Badge
      variant={variant}
      className={cn(signalsUnknown && 'border-warning/60 text-warning', className)}
      data-testid={testId}
      data-tone={dataTone}
    >
      <span aria-hidden="true">{value}</span>
      <span className="sr-only">{label}</span>
    </Badge>
  );
}
