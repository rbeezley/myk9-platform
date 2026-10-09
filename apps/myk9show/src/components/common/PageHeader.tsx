import { Link } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BreadcrumbItem {
  label: string;
  href: string;
  onClick?: () => void;
}

interface PageHeaderProps {
  breadcrumbs: BreadcrumbItem[];
  title: string;
  actions?: React.ReactNode;
  className?: string;
  /**
   * Render the page title visibly instead of screen-reader-only. Opt-in so
   * existing pages that paint their own title are untouched; use it on pages
   * where the largest visible heading would otherwise be a section label.
   */
  showTitle?: boolean;
  /**
   * The page's `DetailHero` is its `h1` (`headingLevel={1}`), so render no title
   * here at all: one page, one `h1`.
   */
  omitTitle?: boolean;
}

export function PageHeader({
  breadcrumbs,
  title,
  actions,
  className,
  showTitle = false,
  omitTitle = false,
}: PageHeaderProps) {
  // Ancestors folded into "…" below `sm`: everything before the immediate parent.
  const foldCount = Math.max(0, breadcrumbs.length - 2);
  return (
    <div className={cn('space-y-1', className)}>
      {!showTitle && !omitTitle && <h1 className="sr-only">{title}</h1>}
      {/* Wrap, don't overflow: on phones the actions drop below the
          breadcrumb instead of pushing the page into a horizontal pan. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        {/* min-w-0 down the chain lets a long trail truncate instead of widening
            the page (MYK9-1065); middle crumbs shrink first, labels keep their
            full text in `title`, and below `sm` all but the parent fold into "…". */}
        <nav
          aria-label="Breadcrumb"
          className="flex min-w-0 max-w-full items-center gap-1.5 text-sm text-muted-foreground"
        >
          {/* -my-2 keeps the breadcrumb row its original height while giving the
              only tap target in it a 44px box instead of the old 24px. */}
          <Link
            to="/"
            aria-label="Home"
            className="-my-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Home className="h-4 w-4" />
          </Link>
          {foldCount > 0 && (
            <span aria-hidden="true" className="flex shrink-0 items-center gap-1.5 sm:hidden">
              <ChevronRight className="h-3.5 w-3.5" />…
            </span>
          )}
          {breadcrumbs.map((item, i) => {
            const isLast = i === breadcrumbs.length - 1;
            const isMiddle = i > 0 && !isLast;
            return (
              <span
                key={item.href}
                className={cn(
                  'flex min-w-0 items-center gap-1.5',
                  isMiddle && 'shrink-[3]',
                  i < foldCount && 'hidden sm:flex'
                )}
              >
                <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                {isLast ? (
                  <span
                    aria-current="page"
                    title={item.label}
                    className="truncate font-medium text-foreground"
                  >
                    {item.label}
                  </span>
                ) : (
                  <Link
                    to={item.href}
                    onClick={item.onClick}
                    title={item.label}
                    className="truncate transition-colors hover:text-foreground"
                  >
                    {item.label}
                  </Link>
                )}
              </span>
            );
          })}
        </nav>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {showTitle && <h1 className="text-2xl font-semibold text-foreground">{title}</h1>}
    </div>
  );
}
