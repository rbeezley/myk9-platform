/**
 * EmptyState Component
 *
 * Premium empty state components with proper visual hierarchy,
 * iconography, and call-to-action patterns. Automatically follows design system.
 */

import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';
import {
  LucideIcon,
  AlertTriangle,
  RefreshCw,
  HelpCircle,
} from 'lucide-react';
import { PremiumButton } from './PremiumButton';
import { IconContainer } from './IconContainer';
import { Skeleton } from '@/components/common/SkeletonLoaders';

export type EmptyStateAction =
  | {
      label: string;
      onClick: () => void;
      href?: never;
      variant?: 'primary' | 'secondary' | 'outline';
      icon?: LucideIcon;
    }
  | {
      label: string;
      href: string;
      onClick?: never;
      variant?: 'primary' | 'secondary' | 'outline';
      icon?: LucideIcon;
    };

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  /** Explicitly use null when the surface has no sensible next action. */
  action: EmptyStateAction | null;
  secondaryAction?:
    | {
        label: string;
        onClick: () => void;
        variant?: 'outline' | 'ghost';
        icon?: LucideIcon;
      }
    | undefined;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'filter';
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  className,
  size = 'md',
  variant = 'default',
}: EmptyStateProps) {
  const sizeConfig = {
    sm: {
      container: 'py-12',
      iconSize: 'md' as const,
      titleSize: 'text-lg',
      descriptionSize: 'text-sm',
      maxWidth: 'max-w-sm',
    },
    md: {
      container: 'py-16',
      iconSize: 'lg' as const,
      titleSize: 'text-xl',
      descriptionSize: 'text-base',
      maxWidth: 'max-w-md',
    },
    lg: {
      container: 'py-20',
      iconSize: 'xl' as const,
      titleSize: 'text-2xl',
      descriptionSize: 'text-lg',
      maxWidth: 'max-w-lg',
    },
  }[size];

  return (
    <div
      data-testid="empty-state"
      data-variant={variant}
      className={cn(
        'flex flex-col items-center justify-center text-center',
        variant === 'filter' ? 'py-8' : sizeConfig.container,
        className
      )}
    >
      {/* Icon */}
      <IconContainer
        icon={icon}
        size={sizeConfig.iconSize}
        variant="default"
        className="mb-6 opacity-60"
        hover={false}
      />

      {/* Content */}
      <div className={cn('space-y-3', sizeConfig.maxWidth)}>
        <h3 className={cn('font-semibold text-foreground', sizeConfig.titleSize)}>{title}</h3>

        {description && (
          <p className={cn('text-muted-foreground leading-relaxed', sizeConfig.descriptionSize)}>
            {description}
          </p>
        )}
      </div>

      {/* Actions */}
      {(action || secondaryAction) && (
        <div className="flex flex-col sm:flex-row items-center gap-3 mt-8">
          {action && (
            'href' in action ? (
              <Link
                to={action.href}
                className={cn(
                  'inline-flex items-center justify-center gap-2 rounded-md px-4 font-medium transition-all',
                  size === 'sm' ? 'h-8 text-sm' : 'h-10 text-sm',
                  action.variant === 'outline'
                    ? 'border border-border/50 text-muted-foreground hover:border-primary/30 hover:text-foreground'
                    : action.variant === 'secondary'
                      ? 'bg-secondary text-secondary-foreground hover:bg-secondary/90'
                      : 'bg-primary text-primary-foreground hover:opacity-90'
                )}
              >
                {action.icon && <action.icon className="h-4 w-4" />}
                {action.label}
              </Link>
            ) : (
              <PremiumButton
                variant={action.variant || 'primary'}
                onClick={action.onClick}
                icon={action.icon}
                size={size === 'sm' ? 'sm' : 'md'}
              >
                {action.label}
              </PremiumButton>
            )
          )}

          {secondaryAction && (
            <PremiumButton
              variant={secondaryAction.variant || 'outline'}
              onClick={secondaryAction.onClick}
              icon={secondaryAction.icon}
              size={size === 'sm' ? 'sm' : 'md'}
            >
              {secondaryAction.label}
            </PremiumButton>
          )}
        </div>
      )}
    </div>
  );
}

// Error Empty State
export interface ErrorEmptyStateProps extends Omit<EmptyStateProps, 'icon' | 'title' | 'action'> {
  error?: string;
  onRetry?: () => void;
  onContactSupport?: () => void;
}

export function ErrorEmptyState({
  error = 'Something went wrong',
  onRetry,
  onContactSupport,
  ...props
}: ErrorEmptyStateProps) {
  return (
    <EmptyState
      icon={AlertTriangle}
      title="Oops! Something went wrong"
      description={error}
      action={
        onRetry
          ? {
              label: 'Try Again',
              onClick: onRetry,
              icon: RefreshCw,
            }
          : null
      }
      secondaryAction={
        onContactSupport
          ? {
              label: 'Contact Support',
              onClick: onContactSupport,
              variant: 'ghost' as const,
              icon: HelpCircle,
            }
          : undefined
      }
      {...props}
    />
  );
}

// Loading Empty State (skeleton placeholder)
export interface LoadingEmptyStateProps {
  message?: string;
  className?: string;
}

export function LoadingEmptyState({ message = 'Loading...', className }: LoadingEmptyStateProps) {
  return (
    <div role="status" aria-label={message} className={cn('space-y-4 py-8', className)}>
      <Skeleton className="mx-auto h-12 w-12 rounded-full" />
      <div className="mx-auto max-w-sm space-y-2">
        <Skeleton className="mx-auto h-4 w-40" />
        <Skeleton className="mx-auto h-3 w-64 max-w-full" />
      </div>
    </div>
  );
}
