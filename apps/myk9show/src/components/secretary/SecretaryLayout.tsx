/**
 * Secretary Layout Component
 * 
 * Provides sidebar navigation layout specifically for secretary pages
 * Uses Apple-inspired design patterns with premium styling
 * Based on the Admin layout pattern
 */

import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { SecretarySidebar } from './SecretarySidebar';
import { Button } from '../ui/button';
import { Menu } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SecretaryLayoutProps {
  children?: React.ReactNode;
}

export const SecretaryLayout: React.FC<SecretaryLayoutProps> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-background">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-72 transform bg-card border-r border-border transition-transform duration-300 ease-in-out md:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <SecretarySidebar onCloseMobile={() => setSidebarOpen(false)} />
      </div>

      {/* Main content area */}
      <div className="flex-1 md:ml-72">
        {/* Mobile header with menu button */}
        <div className="sticky top-16 z-30 flex h-16 items-center gap-4 border-b border-border bg-background/95 backdrop-blur-sm px-4 md:hidden">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSidebarOpen(true)}
            className="hover:bg-muted"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold" style={{ fontWeight: 590 }}>
            Secretary Dashboard
          </h1>
        </div>

        {/* Page content */}
        <main className="flex-1 overflow-auto pt-16 md:pt-0">
          <div className="px-6 py-8 max-w-7xl mx-auto">
            {children || <Outlet />}
          </div>
        </main>
      </div>
    </div>
  );
};

export default SecretaryLayout;