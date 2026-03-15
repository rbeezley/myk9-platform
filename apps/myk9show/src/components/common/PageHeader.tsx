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
}

export function PageHeader({ breadcrumbs, title, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('space-y-1', className)}>
      <h1 className="sr-only">{title}</h1>
      <div className="flex items-center justify-between">
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-1.5 text-sm text-muted-foreground"
        >
          <Link to="/" className="hover:text-foreground transition-colors p-1">
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
    </div>
  );
}
