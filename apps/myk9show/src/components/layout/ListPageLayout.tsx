import React from 'react';
import { AppShellPage } from './AppShell';

interface ListPageLayoutProps {
  actions?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

const ListPageLayout: React.FC<ListPageLayoutProps> = ({
  actions,
  children,
  footer,
  className = '',
}) => {
  return (
    <AppShellPage className={`flex flex-col ${className}`}>
      <div>
        {actions && (
          <div className="container mx-auto px-4 pt-0 pb-0 flex flex-row items-center justify-between">
            {actions}
          </div>
        )}
        <main className="container mx-auto px-4 py-8 flex-1">
          {children}
        </main>
      </div>
      {footer && <div className="w-full">{footer}</div>}
    </AppShellPage>
  );
};

export default ListPageLayout;
