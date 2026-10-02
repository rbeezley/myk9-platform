import type { Ref } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface MetadataItem {
  label: string;
  icon?: React.ReactNode;
}

export interface HeroBadge {
  label: string;
  variant: 'success' | 'warning' | 'destructive' | 'default';
  icon?: React.ReactNode | undefined;
  /** Hover text, for a badge whose meaning is not in its label alone. */
  title?: string | undefined;
  testId?: string | undefined;
}

interface HeroAction {
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
}

export interface HeroParent {
  label: string;
  /** Omit when the viewer cannot open the parent: it then reads as plain text. */
  href?: string | undefined;
}

interface DetailHeroProps {
  /** Small label rendered above the title — e.g. a date range or entity subtype. */
  eyebrow?: string | undefined;
  /** Optional media slot rendered to the left (200px wide). Pass a date block, avatar, or photo. */
  cover?: React.ReactNode | undefined;
  /** Optional media slot's width class; defaults to the 200px date-block width. */
  coverClassName?: string | undefined;
  /** Full-width media rendered above the card body (a club's cover image). */
  banner?: React.ReactNode;
  name: string;
  /** `1` when the hero owns the page heading (pair with `PageHeader omitTitle`). */
  headingLevel?: 1 | 2;
  /** The page h1's ref, for route-entry focus. Only an h1 hero is focusable (tabIndex -1). */
  headingRef?: Ref<HTMLHeadingElement> | undefined;
  /** The parent record, shown as a link under the title (club of a show, show of a trial). */
  parent?: HeroParent | undefined;
  subtitle?: React.ReactNode;
  metadata?: MetadataItem[];
  /** Notices that belong to the record, rendered under the facts row. */
  details?: React.ReactNode;
  badges?: HeroBadge[];
  headerActions?: React.ReactNode;
  closedMessage?: string | undefined;
  primaryAction?: HeroAction;
  secondaryActions?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

const badgeStyles: Record<string, string> = {
  success: 'bg-success/10 text-success border-success/20',
  warning: 'bg-warning/10 text-warning border-warning/20',
  destructive: 'bg-destructive/10 text-destructive border-destructive/20',
  default: 'bg-muted text-muted-foreground border-border',
};

export function DetailHero({
  eyebrow,
  cover,
  coverClassName,
  banner,
  name,
  headingLevel = 2,
  headingRef,
  parent,
  subtitle,
  metadata,
  details,
  badges,
  headerActions,
  closedMessage,
  primaryAction,
  secondaryActions,
  footer,
  className,
}: DetailHeroProps) {
  const Heading = headingLevel === 1 ? 'h1' : 'h2';
  const hasSideActions = Boolean(secondaryActions || primaryAction || closedMessage);

  return (
    <div
      className={cn(
        'relative rounded-xl border border-border/50 bg-card overflow-hidden',
        className
      )}
    >
      {banner}
      <div
        className={cn(
          'gap-4 sm:gap-6 p-6',
          cover
            ? 'flex flex-col sm:flex-row sm:flex-wrap lg:flex-nowrap items-start'
            : 'flex flex-col sm:flex-row sm:items-start sm:justify-between'
        )}
      >
        {cover && (
          <div className={cn('flex-shrink-0 self-start', coverClassName ?? 'w-[200px]')}>
            {cover}
          </div>
        )}

        <div className="space-y-1.5 flex-1 min-w-0">
          {eyebrow && (
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              {eyebrow}
            </p>
          )}
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <Heading
              ref={headingRef}
              // The page heading is a programmatic focus target (route-entry focus
              // lands here), never a tab stop.
              {...(headingLevel === 1 ? { tabIndex: -1 } : {})}
              className={cn(
                'text-2xl font-bold tracking-tight break-words',
                headingLevel === 1 &&
                  'rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
              )}
            >
              {name}
            </Heading>
            {badges?.map((badge, i) => (
              <span
                key={i}
                data-testid={badge.testId}
                title={badge.title}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-sm font-medium',
                  badgeStyles[badge.variant]
                )}
              >
                {badge.icon}
                {badge.label}
              </span>
            ))}
          </div>
          {parent && (
            <div className="text-sm font-medium">
              {parent.href ? (
                // 44x44 at every width (docs/INTENT.md): no breakpoint shrinks it.
                <Link
                  to={parent.href}
                  className="inline-flex min-h-11 min-w-11 items-center text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                >
                  {parent.label}
                </Link>
              ) : (
                <span className="text-muted-foreground">{parent.label}</span>
              )}
            </div>
          )}
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
          {details}
          {/* In flow at every width, inside the title column: it wraps under the
              title instead of being pinned over the side actions (MYK9-736 --
              `lg:absolute` put the status pill on top of the Edit button). */}
          {headerActions && (
            <div className="mt-2 flex flex-wrap items-center gap-2">{headerActions}</div>
          )}
        </div>

        {hasSideActions && (
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
        )}
      </div>
      {footer && <div className="border-t border-border/50 bg-muted/30">{footer}</div>}
    </div>
  );
}
