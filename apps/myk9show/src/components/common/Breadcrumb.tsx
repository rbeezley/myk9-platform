import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';
import type { Crumb } from './breadcrumbCrumb';

interface BreadcrumbProps {
  /** Every crumb but the current page carries a destination; the type requires it (MYK9-2489). */
  items: Crumb[];
  className?: string;
  showHomeIcon?: boolean;
}

const LINK_CLASS =
  'font-medium text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary';

/**
 * A breadcrumb trail. Ancestors are real links (`<Link>`), so middle-click and "open in new tab"
 * work; they were buttons, which do neither (MYK9-2489).
 */
export const Breadcrumb: React.FC<BreadcrumbProps> = ({
  items,
  className = '',
  showHomeIcon = false,
}) => {
  if (items.length === 0) return null;

  return (
    <nav className={`flex items-center gap-2 text-sm ${className}`} aria-label="Breadcrumb">
      <ol className="flex items-center gap-2">
        {showHomeIcon && (
          <>
            <li>
              <Link
                to="/"
                className="inline-flex rounded-md p-1 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                aria-label="Home"
              >
                <Home className="w-4 h-4" />
              </Link>
            </li>
            <li aria-hidden="true">
              <ChevronRight className="w-3 h-3 text-muted-foreground" />
            </li>
          </>
        )}

        {items.map((item, index) => (
          <React.Fragment key={`${item.label}-${index}`}>
            <li>
              {item.isCurrentPage ? (
                <span className="font-medium text-foreground" aria-current="page">
                  {item.label}
                </span>
              ) : (
                <Link to={item.href} onClick={item.onClick} className={LINK_CLASS}>
                  {item.label}
                </Link>
              )}
            </li>

            {index < items.length - 1 && (
              <li aria-hidden="true">
                <ChevronRight className="w-3 h-3 text-muted-foreground" />
              </li>
            )}
          </React.Fragment>
        ))}
      </ol>
    </nav>
  );
};

export default Breadcrumb;
