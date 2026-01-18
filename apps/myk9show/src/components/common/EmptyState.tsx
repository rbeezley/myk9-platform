/**
 * EmptyState Component
 * 
 * Apple-inspired empty state components with proper visual hierarchy,
 * iconography, and call-to-action patterns. Automatically follows design system.
 */


import { cn } from '@/lib/utils';
import { 
  LucideIcon, 
  Database, 
  Plus, 
  Search, 
  X, 
  AlertTriangle, 
  RefreshCw, 
  HelpCircle, 
  Wrench, 
  Lock, 
  Key 
} from 'lucide-react';
import { PremiumButton } from './PremiumButton';
import { IconContainer } from './IconContainer';

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
    variant?: 'primary' | 'secondary' | 'outline';
    icon?: LucideIcon;
  } | undefined;
  secondaryAction?: {
    label: string;
    onClick: () => void;
    variant?: 'outline' | 'ghost';
    icon?: LucideIcon;
  } | undefined;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  className,
  size = 'md'
}: EmptyStateProps) {
  const sizeConfig = {
    sm: {
      container: 'py-12',
      iconSize: 'md' as const,
      titleSize: 'text-lg',
      descriptionSize: 'text-sm',
      maxWidth: 'max-w-sm'
    },
    md: {
      container: 'py-16',
      iconSize: 'lg' as const,
      titleSize: 'text-xl',
      descriptionSize: 'text-base',
      maxWidth: 'max-w-md'
    },
    lg: {
      container: 'py-20',
      iconSize: 'xl' as const,
      titleSize: 'text-2xl',
      descriptionSize: 'text-lg',
      maxWidth: 'max-w-lg'
    }
  }[size];

  return (
    <div className={cn(
      "flex flex-col items-center justify-center text-center",
      sizeConfig.container,
      className
    )}>
      {/* Icon */}
      <IconContainer
        icon={icon}
        size={sizeConfig.iconSize}
        variant="default"
        className="mb-6 opacity-60"
        hover={false}
      />

      {/* Content */}
      <div className={cn("space-y-3", sizeConfig.maxWidth)}>
        <h3 className={cn(
          "font-semibold text-foreground",
          sizeConfig.titleSize
        )}>
          {title}
        </h3>
        
        {description && (
          <p className={cn(
            "text-muted-foreground leading-relaxed",
            sizeConfig.descriptionSize
          )}>
            {description}
          </p>
        )}
      </div>

      {/* Actions */}
      {(action || secondaryAction) && (
        <div className="flex flex-col sm:flex-row items-center gap-3 mt-8">
          {action && (
            <PremiumButton
              variant={action.variant || 'primary'}
              onClick={action.onClick}
              icon={action.icon}
              size={size === 'sm' ? 'sm' : 'md'}
            >
              {action.label}
            </PremiumButton>
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

// Specialized empty state variants

// No Data Empty State
export interface NoDataEmptyStateProps extends Omit<EmptyStateProps, 'icon' | 'title'> {
  entityName: string;
  canCreate?: boolean;
  onCreateClick?: () => void;
}

export function NoDataEmptyState({
  entityName,
  canCreate = true,
  onCreateClick,
  description,
  ...props
}: NoDataEmptyStateProps) {
  const defaultDescription = `No ${entityName.toLowerCase()} have been added yet. ${canCreate ? `Create your first ${entityName.toLowerCase()} to get started.` : 'Check back later for updates.'}`;

  return (
    <EmptyState
      icon={Database}
      title={`No ${entityName} Found`}
      description={description || defaultDescription}
      action={canCreate && onCreateClick ? {
        label: `Add ${entityName}`,
        onClick: onCreateClick,
        icon: Plus
      } : undefined}
      {...props}
    />
  );
}

// Search Empty State
export interface SearchEmptyStateProps extends Omit<EmptyStateProps, 'icon' | 'title'> {
  searchTerm?: string;
  onClearSearch?: () => void;
  suggestions?: string[];
}

export function SearchEmptyState({
  searchTerm,
  onClearSearch,
  suggestions,
  ...props
}: SearchEmptyStateProps) {
  const title = searchTerm 
    ? `No results for "${searchTerm}"`
    : 'No search results';
    
  const description = suggestions?.length 
    ? `Try searching for: ${suggestions.join(', ')}`
    : 'Try adjusting your search criteria or check your spelling.';

  return (
    <EmptyState
      icon={Search}
      title={title}
      description={description}
      action={searchTerm && onClearSearch ? {
        label: 'Clear Search',
        onClick: onClearSearch,
        variant: 'outline' as const,
        icon: X
      } : undefined}
      {...props}
    />
  );
}

// Error Empty State  
export interface ErrorEmptyStateProps extends Omit<EmptyStateProps, 'icon' | 'title'> {
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
      action={onRetry ? {
        label: 'Try Again',
        onClick: onRetry,
        icon: RefreshCw
      } : undefined}
      secondaryAction={onContactSupport ? {
        label: 'Contact Support',
        onClick: onContactSupport,
        variant: 'ghost' as const,
        icon: HelpCircle
      } : undefined}
      {...props}
    />
  );
}

// Loading Empty State (skeleton placeholder)
export interface LoadingEmptyStateProps {
  message?: string;
  className?: string;
}

export function LoadingEmptyState({ 
  message = 'Loading...',
  className 
}: LoadingEmptyStateProps) {
  return (
    <div className={cn(
      "flex flex-col items-center justify-center py-16 text-center",
      className
    )}>
      <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-4" />
      <p className="text-muted-foreground">{message}</p>
    </div>
  );
}

// Maintenance Empty State
export interface MaintenanceEmptyStateProps extends Omit<EmptyStateProps, 'icon' | 'title'> {
  estimatedTime?: string;
  onCheckStatus?: () => void;
}

export function MaintenanceEmptyState({
  estimatedTime,
  onCheckStatus,
  ...props
}: MaintenanceEmptyStateProps) {
  const description = estimatedTime 
    ? `We're performing scheduled maintenance. Expected completion: ${estimatedTime}`
    : "We're performing scheduled maintenance and will be back shortly.";

  return (
    <EmptyState
      icon={Wrench}
      title="Under Maintenance"
      description={description}
      action={onCheckStatus ? {
        label: 'Check Status',
        onClick: onCheckStatus,
        variant: 'outline' as const,
        icon: RefreshCw
      } : undefined}
      {...props}
    />
  );
}

// Permission Empty State
export interface PermissionEmptyStateProps extends Omit<EmptyStateProps, 'icon' | 'title'> {
  requiredPermission?: string;
  onRequestAccess?: () => void;
}

export function PermissionEmptyState({
  requiredPermission,
  onRequestAccess,
  ...props
}: PermissionEmptyStateProps) {
  const description = requiredPermission
    ? `You need ${requiredPermission} permission to view this content.`
    : "You don't have permission to view this content.";

  return (
    <EmptyState
      icon={Lock}
      title="Access Restricted"
      description={description}
      action={onRequestAccess ? {
        label: 'Request Access',
        onClick: onRequestAccess,
        icon: Key
      } : undefined}
      {...props}
    />
  );
}