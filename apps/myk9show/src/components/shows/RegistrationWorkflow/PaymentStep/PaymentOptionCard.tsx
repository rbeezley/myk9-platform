import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { CircleCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Colour of a desk choice's icon (MYK9-2020): money in hand reads green, money
 * still owed reads amber, so "paid" and "not paid yet" look different at a
 * glance. Omitted on the exhibitor's cards, which render exactly as before.
 */
export type PaymentOptionTone = 'paid' | 'unpaid';

interface PaymentOptionCardProps<T extends string> {
  value: T;
  selected: boolean;
  icon: LucideIcon;
  title: string;
  description: string;
  onSelect: (value: T) => void;
  tone?: PaymentOptionTone | undefined;
}

const TONE_ICON_CLASS: Record<PaymentOptionTone, { idle: string; selected: string }> = {
  paid: { idle: 'bg-success/10 text-success', selected: 'bg-success text-success-foreground' },
  unpaid: { idle: 'bg-warning/10 text-warning', selected: 'bg-warning text-warning-foreground' },
};

export function PaymentOptionCard<T extends string>({
  value,
  selected,
  icon: Icon,
  title,
  description,
  onSelect,
  tone,
}: PaymentOptionCardProps<T>): React.ReactElement {
  const iconClass = tone
    ? selected
      ? TONE_ICON_CLASS[tone].selected
      : TONE_ICON_CLASS[tone].idle
    : selected
      ? 'bg-primary text-primary-foreground'
      : 'bg-muted text-muted-foreground';

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
            iconClass
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-foreground">{title}</div>
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
