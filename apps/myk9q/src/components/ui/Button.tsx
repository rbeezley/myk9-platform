import React from 'react';
import { Button as UIButton, type ButtonProps as UIButtonProps } from '@myk9/ui';
import { cn } from '../../lib/utils';

/**
 * Button Component — myK9Q adapter wrapping @myk9/ui Button
 *
 * Maps myK9Q's API to @myk9/ui:
 * - variant: 'primary' → 'default', rest map directly
 * - size: 'md' → 'default', rest map directly
 * - fullWidth → className 'w-full'
 */

interface ButtonProps extends Omit<UIButtonProps, 'variant' | 'size'> {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'outline' | 'gradient' | 'ghost';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  fullWidth?: boolean;
}

// Map myK9Q variant names to @myk9/ui variant names
const variantMap: Record<string, UIButtonProps['variant']> = {
  primary: 'default',
  secondary: 'outline',
  outline: 'outline',
  gradient: 'gradient',
  ghost: 'ghost',
};

// Map myK9Q size names to @myk9/ui size names
const sizeMap: Record<string, UIButtonProps['size']> = {
  sm: 'sm',
  md: 'default',
  lg: 'lg',
  icon: 'icon',
};

export const Button: React.FC<ButtonProps> = ({
  children,
  className,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  ...props
}) => {
  return (
    <UIButton
      variant={variantMap[variant] || 'default'}
      size={sizeMap[size] || 'default'}
      className={cn(fullWidth && 'w-full', className)}
      {...props}
    >
      {children}
    </UIButton>
  );
};
