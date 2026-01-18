/**
 * DashboardLayout Component
 * 
 * Apple-inspired dashboard layout with proper spacing, navigation clearance,
 * and consistent structure. Automatically follows design system.
 */

/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { RefreshCw, Download, Settings } from 'lucide-react';
import { LucideIcon } from 'lucide-react';

export interface DashboardAction {
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  variant?: 'default' | 'outline' | 'ghost';
  disabled?: boolean;
}

export interface DashboardLayoutProps {
  children: React.ReactNode;
  title: string;
  description?: string;
  icon?: LucideIcon;
  actions?: DashboardAction[];
  className?: string;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '7xl' | 'full';
}

export function DashboardLayout({
  children,
  title,
  description,
  icon: Icon,
  actions = [],
  className,
  maxWidth = '7xl'
}: DashboardLayoutProps) {
  const maxWidthClass = {
    'sm': 'max-w-sm',
    'md': 'max-w-md', 
    'lg': 'max-w-lg',
    'xl': 'max-w-xl',
    '2xl': 'max-w-2xl',
    '7xl': 'max-w-7xl',
    'full': 'max-w-full'
  }[maxWidth] || 'max-w-7xl';

  return (
    <div className={cn("min-h-screen pt-20 pb-8 px-6", maxWidthClass, "mx-auto", className)}>
      {/* Dashboard Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 mb-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            {Icon && (
              <div className="w-10 h-10 bg-gradient-to-br from-primary/20 to-primary/10 rounded-xl flex items-center justify-center shadow-sm">
                <Icon className="h-6 w-6 text-primary" />
              </div>
            )}
            {title}
          </h1>
          {description && (
            <p className="text-muted-foreground text-lg max-w-2xl">
              {description}
            </p>
          )}
        </div>
        
        {/* Dashboard Actions */}
        {actions.length > 0 && (
          <div className="flex gap-3">
            {actions.map((action, index) => (
              <Button
                key={index}
                variant={action.variant || 'outline'}
                size="sm"
                onClick={action.onClick}
                disabled={action.disabled}
                className={cn(
                  "transition-all duration-300 shadow-sm",
                  action.variant === 'default' 
                    ? "bg-gradient-to-r from-primary to-secondary text-primary-foreground hover:shadow-xl hover:-translate-y-1 hover:scale-[1.02]"
                    : "border-border/50 text-muted-foreground hover:text-foreground hover:border-primary/30 hover:-translate-y-0.5"
                )}
              >
                {action.icon && <action.icon className="h-4 w-4 mr-2" />}
                {action.label}
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* Dashboard Content */}
      <div className="space-y-8">
        {children}
      </div>
    </div>
  );
}

// Convenience component for common dashboard patterns
export interface StatsDashboardLayoutProps extends Omit<DashboardLayoutProps, 'children'> {
  stats: React.ReactNode;
  content: React.ReactNode;
  sidebar?: React.ReactNode;
}

export function StatsDashboardLayout({
  stats,
  content,
  sidebar,
  ...dashboardProps
}: StatsDashboardLayoutProps) {
  return (
    <DashboardLayout {...dashboardProps}>
      {/* Stats Section */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {stats}
        </div>
      )}
      
      {/* Main Content with Optional Sidebar */}
      <div className={cn(
        "grid gap-8",
        sidebar ? "grid-cols-1 lg:grid-cols-4" : "grid-cols-1"
      )}>
        <div className={sidebar ? "lg:col-span-3" : "col-span-1"}>
          {content}
        </div>
        {sidebar && (
          <div className="lg:col-span-1">
            {sidebar}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

// Common dashboard action presets
export const createRefreshAction = (onRefresh: () => void): DashboardAction => ({
  label: 'Refresh',
  icon: RefreshCw,
  onClick: onRefresh,
  variant: 'outline'
});

export const createExportAction = (onExport: () => void): DashboardAction => ({
  label: 'Export',
  icon: Download,
  onClick: onExport,
  variant: 'outline'
});

export const createSettingsAction = (onSettings: () => void): DashboardAction => ({
  label: 'Settings',
  icon: Settings,
  onClick: onSettings,
  variant: 'ghost'
});

export const createPrimaryAction = (label: string, onClick: () => void, icon?: LucideIcon): DashboardAction => ({
  label,
  ...(icon !== undefined && { icon }),
  onClick,
  variant: 'default'
});