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
}

export function PageHeader({
  breadcrumbs,
  title,
  actions,
  className,
  showTitle = false,
}: PageHeaderProps) {
  return (
    <div className={cn('space-y-1', className)}>
      {!showTitle && <h1 className="sr-only">{title}</h1>}
      <div className="flex items-center justify-between">
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-1.5 text-sm text-muted-foreground"
        >
          {/* -my-2 keeps the breadcrumb row its original height while giving the
              only tap target in it a 44px box instead of the old 24px. */}
          <Link
            to="/"
            aria-label="Home"
            className="-my-2 inline-flex h-11 w-11 items-center justify-center rounded-lg transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Home className="h-4 w-4" />
          </Link>
          {breadcrumbs.map((item, i) => (
            <span key={item.href} className="flex items-center gap-1.5">
              <ChevronRight className="h-3.5 w-3.5" />
              {i === breadcrumbs.length - 1 ? (
                <span className="text-foreground font-medium">{item.label}</span>
              ) : (
                <Link
                  to={item.href}
                  onClick={item.onClick}
                  className="hover:text-foreground transition-colors"
                >
                  {item.label}
                </Link>
              )}
            </span>
          ))}
        </nav>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {showTitle && <h1 className="text-2xl font-semibold text-foreground">{title}</h1>}
    </div>
  );
}
