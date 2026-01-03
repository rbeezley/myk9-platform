import React, { startTransition } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';
import { buildClasses } from '@/utils/designTokens';

interface BreadcrumbItem {
  label: string;
  href?: string;
  onClick?: () => void;
  id?: string;
  isCurrentPage?: boolean;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
  showHomeIcon?: boolean;
}

export const Breadcrumb: React.FC<BreadcrumbProps> = ({
  items,
  className = '',
  showHomeIcon = false
}) => {
  const navigate = useNavigate();

  const handleClick = (item: BreadcrumbItem) => {
    if (item.isCurrentPage) return;
    
    if (item.onClick) {
      item.onClick();
    } else if (item.href) {
      startTransition(() => {
        navigate(item.href!);
      });
    }
  };

  if (items.length === 0) return null;

  return (
    <nav className={`flex items-center gap-2 text-sm ${className}`} aria-label="Breadcrumb">
      <ol className="flex items-center gap-2">
        {showHomeIcon && (
          <>
            <li>
              <button
                onClick={() => startTransition(() => navigate('/'))}
                className={`${buildClasses.button.ghost} p-1 rounded-md text-muted-foreground hover:text-primary transition-colors`}
                aria-label="Home"
              >
                <Home className="w-4 h-4" />
              </button>
            </li>
            {items.length > 0 && (
              <li aria-hidden="true">
                <ChevronRight className="w-3 h-3 text-muted-foreground" />
              </li>
            )}
          </>
        )}
        
        {items.map((item, index) => (
          <React.Fragment key={`${item.label}-${index}`}>
            <li>
              {item.isCurrentPage ? (
                <span className="font-medium text-foreground" aria-current="page">
                  {item.label}
                </span>
              ) : (item.href || item.onClick) ? (
                <button
                  onClick={() => handleClick(item)}
                  className={`${buildClasses.button.ghost} font-medium text-muted-foreground hover:text-primary transition-colors`}
                >
                  {item.label}
                </button>
              ) : (
                <span className="font-medium text-muted-foreground">
                  {item.label}
                </span>
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