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
  const text =
    showing === total ? `${total} ${entityName}` : `${showing} of ${total} ${entityName}`;

  return (
    <span className={cn('text-sm text-muted-foreground', className)}>
      {text}
      {filtered && ' (filtered)'}
    </span>
  );
}
