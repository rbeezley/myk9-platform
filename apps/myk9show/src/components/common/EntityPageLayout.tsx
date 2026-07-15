import React from 'react';
import { cn } from '@/lib/utils';
import { AppShellPage } from '@/components/layout/AppShell';

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
    <AppShellPage maxWidthClass="max-w-[1200px]" className={cn('w-full', className)}>
      <div className="w-full">
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
    </AppShellPage>
  );
};

export default EntityPageLayout;
