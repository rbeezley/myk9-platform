/**
 * PremiumButton Component
 * 
 * Premium button components with gradient backgrounds, enhanced hover effects,
 * and sophisticated animations. Automatically follows design system.
 */

import React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { LucideIcon, Loader2 } from 'lucide-react';

export interface PremiumButtonProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
  icon?: LucideIcon | undefined;
  iconPosition?: 'left' | 'right';
  loading?: boolean;
  disabled?: boolean;
  className?: string;
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
}

export function PremiumButton({
  children,
  variant = 'primary',
  size = 'md',
  icon: Icon,
  iconPosition = 'left',
  loading = false,
  disabled = false,
  className,
  onClick,
  type = 'button'
}: PremiumButtonProps) {
  const isDisabled = disabled || loading;

  const buttonClassName = cn(
    // Base styling
    "font-medium transition-all duration-300 shadow-sm relative overflow-hidden",
    
    // Size variants
    size === 'sm' && "h-8 px-3 text-sm",
    size === 'md' && "h-10 px-4 text-sm", 
    size === 'lg' && "h-12 px-6 text-base",
    
    // Variant styling
    variant === 'primary' && [
      "bg-primary text-primary-foreground border-0",
      "hover:opacity-90 hover:shadow-lg hover:-translate-y-0.5",
      "active:scale-[0.98] active:translate-y-0"
    ],
    
    variant === 'secondary' && [
      "bg-secondary text-secondary-foreground border-0",
      "hover:bg-secondary/90 hover:shadow-lg hover:-translate-y-0.5"
    ],
    
    variant === 'outline' && [
      "border border-border/50 bg-transparent text-muted-foreground",
      "hover:text-foreground hover:border-primary/30 hover:-translate-y-0.5 hover:shadow-sm",
      "hover:bg-gradient-to-r hover:from-primary/5 hover:to-transparent"
    ],
    
    variant === 'ghost' && [
      "border-0 bg-transparent text-primary",
      "hover:bg-primary/10 hover:-translate-y-0.5"
    ],
    
    variant === 'destructive' && [
      "bg-gradient-to-r from-red-500 to-red-600 text-white border-0",
      "hover:from-red-600 hover:to-red-700 hover:shadow-lg hover:-translate-y-0.5"
    ],
    
    // Disabled state
    isDisabled && "opacity-50 cursor-not-allowed hover:transform-none hover:shadow-sm",
    
    className
  );

  return (
    <Button
      type={type}
      className={buttonClassName}
      onClick={onClick}
      disabled={isDisabled}
    >
      {/* Shimmer effect for primary buttons */}
      {variant === 'primary' && !isDisabled && (
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -skew-x-12 translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000" />
      )}
      
      <span className="relative flex items-center gap-2">
        {loading && (
          <Loader2 className="h-4 w-4 animate-spin" />
        )}
        
        {Icon && iconPosition === 'left' && !loading && (
          <Icon className={cn(
            size === 'sm' && "h-3 w-3",
            size === 'md' && "h-4 w-4",
            size === 'lg' && "h-5 w-5"
          )} />
        )}
        
        {children}
        
        {Icon && iconPosition === 'right' && !loading && (
          <Icon className={cn(
            size === 'sm' && "h-3 w-3",
            size === 'md' && "h-4 w-4", 
            size === 'lg' && "h-5 w-5"
          )} />
        )}
      </span>
    </Button>
  );
}

// Specialized button variants for common use cases

// CTA Button - Call-to-action with enhanced styling
export type CTAButtonProps = Omit<PremiumButtonProps, 'variant'>;

export function CTAButton({
  size = 'lg',
  className,
  ...props
}: CTAButtonProps) {
  return (
    <PremiumButton
      variant="primary"
      size={size}
      className={cn(
        "shadow-lg hover:shadow-xl font-semibold",
        className
      )}
      {...props}
    />
  );
}

// Icon Button - Button with just an icon
export interface IconButtonProps extends Omit<PremiumButtonProps, 'children' | 'icon'> {
  icon: LucideIcon;
  'aria-label': string;
  tooltip?: string;
}

export function IconButton({ 
  icon: Icon, 
  size = 'md',
  variant = 'ghost',
  className,
  ...props 
}: IconButtonProps) {
  const sizeClass = {
    'sm': 'h-8 w-8 p-0',
    'md': 'h-10 w-10 p-0',
    'lg': 'h-12 w-12 p-0'
  }[size];

  return (
    <PremiumButton
      variant={variant}
      className={cn(sizeClass, "rounded-full", className)}
      {...props}
    >
      <Icon className={cn(
        size === 'sm' && "h-3 w-3",
        size === 'md' && "h-4 w-4",
        size === 'lg' && "h-5 w-5"
      )} />
    </PremiumButton>
  );
}

// Button Group - Multiple buttons grouped together
export interface ButtonGroupProps {
  children: React.ReactNode;
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}

export function ButtonGroup({ 
  children, 
  orientation = 'horizontal',
  className 
}: ButtonGroupProps) {
  return (
    <div className={cn(
      "flex",
      orientation === 'horizontal' ? "flex-row" : "flex-col",
      orientation === 'horizontal' ? "space-x-2" : "space-y-2",
      className
    )}>
      {children}
    </div>
  );
}

// Floating Action Button - Prominent floating button
export interface FABProps extends Omit<PremiumButtonProps, 'variant' | 'size'> {
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
}

export function FloatingActionButton({ 
  position = 'bottom-right',
  className,
  ...props 
}: FABProps) {
  const positionClass = {
    'bottom-right': 'fixed bottom-6 right-6',
    'bottom-left': 'fixed bottom-6 left-6',
    'top-right': 'fixed top-24 right-6',
    'top-left': 'fixed top-24 left-6'
  }[position];

  return (
    <PremiumButton
      variant="primary"
      size="lg"
      className={cn(
        positionClass,
        "rounded-full w-14 h-14 p-0 shadow-2xl z-50",
        "hover:scale-110 hover:shadow-2xl",
        className
      )}
      {...props}
    />
  );
}