import { cn } from '@/lib/utils';

interface ResultsCountProps {
  showing: number;
  total: number;
  filtered?: boolean;
  entityName?: string;
  className?: string;
}

export function ResultsCount({
  showing,
  total,
  filtered,
  entityName = 'items',
  className,
}: ResultsCountProps) {
  // "68 dogs" when nothing is narrowed; "Showing 12 of 68 dogs" when it is.
  // "Showing … of …" already tells the user the list is narrowed, so the older
  // "(filtered)" parenthetical was redundant system-speak.
  const text =
    showing === total ? `${total} ${entityName}` : `Showing ${showing} of ${total} ${entityName}`;

  return (
    <span className={cn('text-sm text-muted-foreground', className)}>
      {text}
      {filtered && showing === total && ' (filtered)'}
    </span>
  );
}
