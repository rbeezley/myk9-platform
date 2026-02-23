import React from 'react';
import {
  Card as UICard,
  CardHeader as UICardHeader,
  CardContent as UICardContent,
  CardFooter as UICardFooter,
} from '@myk9/ui';
import { cn } from '../../lib/utils';

/**
 * Card Components — myK9Q adapters wrapping @myk9/ui Card
 *
 * API mapping:
 * - variant 'clickable' → adds cursor-pointer + hover styles
 * - variant 'scored'/'unscored' → maps to @myk9/ui Card variants
 * - CardActions → re-exports @myk9/ui CardFooter with myK9Q styling
 */

interface CardProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'clickable' | 'scored' | 'unscored';
  onClick?: () => void;
}

const clickableStyles = [
  'cursor-pointer',
  'hover:-translate-y-0.5 hover:shadow-lg',
  'active:scale-[0.98] active:transition-transform active:duration-100',
].join(' ');

export const Card: React.FC<CardProps> = ({
  children,
  className,
  variant = 'default',
  onClick,
}) => {
  const isClickable = variant === 'clickable' || !!onClick;
  // Map 'clickable' to 'default' for @myk9/ui (it doesn't have a clickable variant)
  const uiVariant = variant === 'clickable' ? 'default' : variant;

  return (
    <UICard
      variant={uiVariant as 'default' | 'scored' | 'unscored'}
      className={cn(
        'p-4', // myK9Q default padding
        isClickable && clickableStyles,
        className,
      )}
      onClick={onClick}
    >
      {children}
    </UICard>
  );
};

interface CardSubProps {
  children: React.ReactNode;
  className?: string;
}

export const CardHeader: React.FC<CardSubProps> = ({ children, className }) => (
  <UICardHeader className={cn('flex-row items-center justify-between p-0 pb-3 space-y-0', className)}>
    {children}
  </UICardHeader>
);

export const CardContent: React.FC<CardSubProps> = ({ children, className }) => (
  <UICardContent className={cn('p-0', className)}>
    {children}
  </UICardContent>
);

/**
 * CardActions — maps to @myk9/ui's CardFooter with myK9Q-style separator
 */
export const CardActions: React.FC<CardSubProps> = ({ children, className }) => (
  <UICardFooter className={cn('gap-2 p-0 pt-4 mt-4 border-t border-border', className)}>
    {children}
  </UICardFooter>
);
