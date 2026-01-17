import { ReactNode } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { buildClasses } from '@/utils/designTokens';

export interface EntityCardProps {
  title?: string | ReactNode;
  subtitle?: string | ReactNode;
  headerAction?: ReactNode;
  avatarUrl?: string;
  avatarFallback?: string | ReactNode;
  avatarSize?: 'sm' | 'md' | 'lg';
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  headerClassName?: string;
  contentClassName?: string;
}

const avatarSizes = {
  sm: 'h-10 w-10',
  md: 'h-16 w-16',
  lg: 'h-20 w-20',
};

export function EntityCard({
  title,
  subtitle,
  headerAction,
  avatarUrl,
  avatarFallback,
  avatarSize = 'md',
  children,
  onClick,
  className,
  headerClassName,
  contentClassName,
}: EntityCardProps) {
  const cardContent = (
    <>
      {(title || subtitle || headerAction || avatarUrl || avatarFallback) && (
        <CardHeader className={cn('pb-3', headerClassName)}>
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              {(avatarUrl || avatarFallback) && (
                <div className={cn(
                  'rounded-full bg-muted flex items-center justify-center flex-shrink-0',
                  avatarSizes[avatarSize]
                )}>
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt=""
                      className={cn('rounded-full object-cover', avatarSizes[avatarSize])}
                    />
                  ) : (
                    <span className="text-muted-foreground font-medium">
                      {avatarFallback}
                    </span>
                  )}
                </div>
              )}
              <div className="flex-1">
                {title && (
                  <h3 className="text-lg font-semibold text-foreground">
                    {title}
                  </h3>
                )}
                {subtitle && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {subtitle}
                  </p>
                )}
              </div>
            </div>
            {headerAction && (
              <div className="flex-shrink-0 ml-4">
                {headerAction}
              </div>
            )}
          </div>
        </CardHeader>
      )}
      <CardContent className={cn('pt-0', contentClassName)}>
        {children}
      </CardContent>
    </>
  );

  if (onClick) {
    return (
      <Card
        className={cn(
          buildClasses.card.standard,
          'cursor-pointer',
          className
        )}
        onClick={onClick}
      >
        {cardContent}
      </Card>
    );
  }

  return (
    <Card className={cn(buildClasses.card.base, className)}>
      {cardContent}
    </Card>
  );
}