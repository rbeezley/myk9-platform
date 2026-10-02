import type { ReactNode } from 'react';
import { NotSet } from '@/components/common/NotSet';

interface FactCellProps {
  label: string;
  /** `null` is a blank the secretary should fill: it reads "Not set". */
  value: ReactNode | null;
  secondary?: ReactNode;
  testId?: string;
}

/**
 * One cell of a detail hero's facts strip (a `DetailHero` footer): a small label
 * over a value, with the shared empty-value rule applied (owner decision 6).
 * An optional blank field is not rendered at all, so callers filter those out
 * instead of passing `null`.
 */
export function FactCell({ label, value, secondary, testId }: FactCellProps) {
  return (
    <div
      data-testid={testId}
      className="flex-1 min-w-[120px] px-4 py-2.5 border-r border-border/50 last:border-r-0"
    >
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-medium mt-0.5">{value ?? <NotSet />}</div>
      {secondary && <div className="text-xs text-muted-foreground mt-0.5">{secondary}</div>}
    </div>
  );
}
