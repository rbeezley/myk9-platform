import * as React from 'react';
import { cn } from '@/lib/utils';

export type ChipColor = 'green' | 'amber' | 'red' | 'blue' | 'purple' | 'teal' | 'stone';

export type ChipSize = 'sm' | 'md';

export interface ChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  color?: ChipColor;
  size?: ChipSize;
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
}

const COLOR_STYLE: Record<ChipColor, React.CSSProperties> = {
  green: { background: 'var(--chip-green-bg)', color: 'var(--chip-green-fg)' },
  amber: { background: 'var(--chip-amber-bg)', color: 'var(--chip-amber-fg)' },
  red: { background: 'var(--chip-red-bg)', color: 'var(--chip-red-fg)' },
  blue: { background: 'var(--chip-blue-bg)', color: 'var(--chip-blue-fg)' },
  purple: { background: 'var(--chip-purple-bg)', color: 'var(--chip-purple-fg)' },
  teal: { background: 'var(--chip-teal-bg)', color: 'var(--chip-teal-fg)' },
  stone: { background: 'var(--chip-stone-bg)', color: 'var(--chip-stone-fg)' },
};

const SIZE_CLASS: Record<ChipSize, string> = {
  sm: 'px-2 py-0.5 text-xs gap-1',
  md: 'px-2.5 py-1 text-sm gap-1.5',
};

export const Chip = React.forwardRef<HTMLSpanElement, ChipProps>(
  (
    {
      color = 'stone',
      size = 'md',
      leadingIcon,
      trailingIcon,
      className,
      style,
      children,
      ...rest
    },
    ref
  ) => {
    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center rounded-full font-medium whitespace-nowrap leading-none',
          SIZE_CLASS[size],
          className
        )}
        style={{ ...COLOR_STYLE[color], ...style }}
        {...rest}
      >
        {leadingIcon ? (
          <span aria-hidden className="inline-flex shrink-0">
            {leadingIcon}
          </span>
        ) : null}
        {children}
        {trailingIcon ? (
          <span aria-hidden className="inline-flex shrink-0">
            {trailingIcon}
          </span>
        ) : null}
      </span>
    );
  }
);
Chip.displayName = 'Chip';
