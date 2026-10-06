import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { JudgeDayOption } from '@/lib/reports/judgeDayScope';

export interface JudgeDayScopeControl {
  /** `'all'` or `${judgeId}|${date}`. */
  value: string;
  options: readonly JudgeDayOption[];
  onChange: (value: string) => void;
}

/**
 * MYK9-1030: "Judge's day" — one judge's classes on one date, across trials, for the marked
 * catalog the judge initials at the end of their day. Picking one clears the trial and class.
 */
export function JudgeDayScopeSelect({ value, options, onChange }: JudgeDayScopeControl) {
  const selectedLabel =
    value === 'all'
      ? 'Any judge'
      : (options.find(option => option.value === value)?.label ?? 'Any judge');
  return (
    <div className="flex min-w-0 flex-col gap-1 sm:w-auto">
      <label htmlFor="judge-day-select" className="text-xs font-medium text-muted-foreground">
        Judge&rsquo;s day
      </label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id="judge-day-select" className="h-10 w-full sm:w-[220px]">
          <SelectValue placeholder="Any judge">{selectedLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Any judge</SelectItem>
          {options.map(option => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
