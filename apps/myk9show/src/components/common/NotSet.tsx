import { cn } from '@/lib/utils';

/**
 * The one empty value for a field the secretary should fill (owner decision 6,
 * docs/plan-core-object-ui-consistency.md): "Not set" in muted text.
 *
 * The other two cases are not this component's job: an optional blank field is
 * hidden entirely, and a blank table cell reads "—".
 */
export function NotSet({ className }: { className?: string }) {
  return <span className={cn('text-muted-foreground italic font-normal', className)}>Not set</span>;
}
