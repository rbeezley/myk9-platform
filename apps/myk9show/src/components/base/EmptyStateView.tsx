import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';
import { buildClasses } from '@/utils/designTokens';

export interface EmptyStateViewProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  iconClassName?: string;
}

export function EmptyStateView({
  icon: Icon,
  title,
  description,
  action,
  className,
  iconClassName,
}: EmptyStateViewProps) {
  return (
    <div className={cn(
      buildClasses.emptyState.container,
      className
    )}>
      {Icon && (
        <div className={buildClasses.emptyState.icon}>
          <Icon className={cn(
            buildClasses.emptyState.iconSize,
            'text-muted-foreground',
            iconClassName
          )} />
        </div>
      )}
      <h3 className={cn(
        buildClasses.emptyState.title,
        'text-foreground'
      )}>
        {title}
      </h3>
      {description && (
        <p className={buildClasses.emptyState.description}>
          {description}
        </p>
      )}
      {action && (
        <div>
          {action}
        </div>
      )}
    </div>
  );
}