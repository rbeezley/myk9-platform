import { cn } from '@/lib/utils';

interface MetadataItem {
  label: string;
  icon?: React.ReactNode;
}

export interface HeroBadge {
  label: string;
  variant: 'success' | 'warning' | 'destructive' | 'default';
}

interface HeroAction {
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
}

interface DetailHeroProps {
  /** Small label rendered above the title — e.g. a date range or entity subtype. */
  eyebrow?: string | undefined;
  /** Optional media slot rendered to the left (200px wide). Pass a date block, avatar, or photo. */
  cover?: React.ReactNode | undefined;
  name: string;
  subtitle?: string | undefined;
  metadata?: MetadataItem[];
  badges?: HeroBadge[];
  closedMessage?: string | undefined;
  primaryAction?: HeroAction;
  secondaryActions?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

const badgeStyles: Record<string, string> = {
  success: 'bg-green-500/10 text-green-600 border-green-500/20',
  warning: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
  destructive: 'bg-destructive/10 text-destructive border-destructive/20',
  default: 'bg-muted text-muted-foreground border-border',
};

export function DetailHero({
  eyebrow,
  cover,
  name,
  subtitle,
  metadata,
  badges,
  closedMessage,
  primaryAction,
  secondaryActions,
  footer,
  className,
}: DetailHeroProps) {
  return (
    <div className={cn('rounded-xl border border-border/50 bg-card overflow-hidden', className)}>
      <div
        className={cn(
          'gap-4 sm:gap-6 p-6',
          cover
            ? 'flex flex-row flex-wrap sm:flex-nowrap items-start'
            : 'flex flex-col sm:flex-row sm:items-start sm:justify-between'
        )}
      >
        {cover && <div className="w-[200px] flex-shrink-0 self-start">{cover}</div>}

        <div className="space-y-1.5 flex-1 min-w-0">
          {eyebrow && (
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              {eyebrow}
            </p>
          )}
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-2xl font-bold tracking-tight">{name}</h2>
            {badges?.map((badge, i) => (
              <span
                key={i}
                className={cn(
                  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-sm font-medium',
                  badgeStyles[badge.variant]
                )}
              >
                {badge.label}
              </span>
            ))}
          </div>
          {subtitle && <div className="text-sm font-medium text-muted-foreground">{subtitle}</div>}
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

        <div className="flex flex-col items-end gap-2 w-full sm:w-auto sm:flex-shrink-0 self-start">
          <div className="flex flex-wrap items-center justify-end gap-2">
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
          {closedMessage && <p className="text-sm text-muted-foreground">{closedMessage}</p>}
        </div>
      </div>
      {footer && <div className="border-t border-border/50 bg-muted/30">{footer}</div>}
    </div>
  );
}
