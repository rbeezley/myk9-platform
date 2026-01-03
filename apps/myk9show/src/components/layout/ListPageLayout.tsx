import React from 'react';

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
    <div className={`min-h-screen bg-background flex flex-col ${className}`}>
      {/* Top padding to account for fixed header (h-16 = 64px) */}
      <div className="pt-20">
        {actions && (
          <div className="container mx-auto px-4 pt-6 pb-0 flex flex-row items-center justify-between">
            {actions}
          </div>
        )}
        <main className="container mx-auto px-4 py-8 flex-1">
          {children}
        </main>
      </div>
      {footer && <div className="w-full">{footer}</div>}
    </div>
  );
};

export default ListPageLayout;
