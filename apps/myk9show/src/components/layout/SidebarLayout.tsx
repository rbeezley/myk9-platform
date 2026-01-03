
import React, { ReactNode } from 'react';

interface SidebarLayoutProps {
  sidebar: ReactNode;
  children: ReactNode;
}

export const SidebarLayout = ({ sidebar, children }: SidebarLayoutProps) => {
  return (
    <div className="min-h-screen bg-gray-50 flex">
      {sidebar}
      <div className="flex-1 overflow-auto">
        {children}
      </div>
    </div>
  );
}
