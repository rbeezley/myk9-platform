import React from 'react';
import { cn } from '@/lib/utils';

interface EntityPageLayoutProps {
  children: React.ReactNode;
  className?: string;
  title: string;
  subtitle: string;
  actions: React.ReactNode;
}

/**
 * EntityPageLayout is the root container for all entity detail pages.
 * It provides consistent outer layout, width, and spacing for entity pages
 * and ensures all entity pages have identical structure.
 * 
 * This component should be used as the top-level wrapper for all Club, Dog, 
 * Show, and User detail pages, as well as their related components like
 * ShowStatistics.
 */
const EntityPageLayout: React.FC<EntityPageLayoutProps> = ({
  children,
  className,
  title,
  subtitle,
  actions,
}) => {
  return (
    <div className={cn(
      "w-full flex justify-center pt-20",
      className
    )}>
      <div className="w-full max-w-[1200px] px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
              <p className="text-muted-foreground">{subtitle}</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {actions}
          </div>
        </div>
        {children}
      </div>
    </div>
  );
};

export default EntityPageLayout;
