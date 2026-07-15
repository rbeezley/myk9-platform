import React from 'react';
import { cn } from '@/lib/utils';
import { APP_SHELL_PAGE_CLASS } from './appShellContract';

interface AppShellPageProps {
  children: React.ReactNode;
  maxWidthClass?: string | undefined;
  className?: string | undefined;
}

/** Root page surface for routes rendered inside UnifiedAppLayout. */
export function AppShellPage({
  children,
  maxWidthClass = 'max-w-7xl',
  className,
}: AppShellPageProps) {
  return (
    <div
      data-layout="app-shell-page"
      data-testid="app-shell-page"
      className={cn(APP_SHELL_PAGE_CLASS, maxWidthClass, 'mx-auto', className)}
    >
      {children}
    </div>
  );
}
