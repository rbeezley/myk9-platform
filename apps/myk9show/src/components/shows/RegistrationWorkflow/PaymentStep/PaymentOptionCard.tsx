import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { CircleCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PaymentOptionCardProps<T extends string> {
  value: T;
  selected: boolean;
  icon: LucideIcon;
  title: string;
  description: string;
  onSelect: (value: T) => void;
  /**
   * MYK9-2020: a short word beside the title ("Paid", "Not paid yet") so the
   * secretary's choices that mean money is in hand look different from the ones
   * that mean it is still owed. Omitted on the exhibitor's list.
   */
  badge?: React.ReactNode;
}

/** One selectable payment choice: a full-width card with a pressed state. */
export function PaymentOptionCard<T extends string>({
  value,
  selected,
  icon: Icon,
  title,
  description,
  onSelect,
  badge,
}: PaymentOptionCardProps<T>) {
  return (
    // aria-pressed, not role="radio": the selected state was invisible to a
    // screen reader (plain buttons, and the RadioGroup wrapper had no radio
    // children). A radio role would promise roving tabindex and arrow-key
    // navigation these cards do not implement, and a radiogroup may not contain
    // the input/textarea detail panels interleaved between these options.
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(value)}
      className={cn(
        'relative w-full rounded-lg border-2 p-4 text-left transition-all duration-150',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        selected
          ? 'border-primary bg-primary/5 shadow-sm'
          : 'border-border bg-card hover:border-muted-foreground/40 hover:bg-accent/50'
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors',
            selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          {badge ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-foreground">{title}</span>
              {badge}
            </div>
          ) : (
            <div className="font-medium text-foreground">{title}</div>
          )}
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
        <div
          className={cn(
            'flex h-5 w-5 shrink-0 items-center justify-center transition-colors',
            selected ? 'text-primary' : 'text-muted-foreground'
          )}
        >
          {selected ? (
            <CircleCheck className="h-5 w-5" />
          ) : (
            <div className="h-4 w-4 rounded-full border-2 border-current" />
          )}
        </div>
      </div>
    </button>
  );
}
