import { cn } from '@/lib/utils';

interface MetadataItem {
  label: string;
  icon?: React.ReactNode;
}

interface HeroBadge {
  label: string;
  variant: 'success' | 'warning' | 'destructive' | 'default';
}

interface HeroAction {
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
}

interface DetailHeroProps {
  name: string;
  metadata?: MetadataItem[];
  badge?: HeroBadge;
  primaryAction?: HeroAction;
  secondaryActions?: React.ReactNode;
  className?: string;
}

const badgeStyles: Record<string, string> = {
  success: 'bg-green-500/10 text-green-600 border-green-500/20',
  warning: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
  destructive: 'bg-destructive/10 text-destructive border-destructive/20',
  default: 'bg-muted text-muted-foreground border-border',
};

export function DetailHero({
  name,
  metadata,
  badge,
  primaryAction,
  secondaryActions,
  className,
}: DetailHeroProps) {
  return (
    <div className={cn('rounded-xl border border-border/50 bg-card p-6', className)}>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-2xl font-bold tracking-tight">{name}</h2>
            {badge && (
              <span
                className={cn(
                  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-sm font-medium',
                  badgeStyles[badge.variant]
                )}
              >
                {badge.label}
              </span>
            )}
          </div>
          {metadata && metadata.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground">
              {metadata.map((item, i) => (
                <span key={i} className="flex items-center gap-1.5 text-sm">
                  {item.icon}
                  {item.label}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {secondaryActions}
          {primaryAction && (
            <button
              onClick={primaryAction.onClick}
              className="h-12 px-6 text-base font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center gap-2"
            >
              {primaryAction.icon}
              {primaryAction.label}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
