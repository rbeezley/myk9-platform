/**
 * StandardPageLayout Component
 *
 * Apple-inspired standard page layout for non-dashboard pages.
 * Provides consistent structure, spacing, and navigation clearance.
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ArrowLeft, LucideIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface PageAction {
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  variant?: 'default' | 'outline' | 'ghost' | 'destructive';
  disabled?: boolean;
}

export interface StandardPageLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  description?: string;
  breadcrumbs?: BreadcrumbItem[];
  actions?: PageAction[];
  showBackButton?: boolean;
  backHref?: string;
  className?: string;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '4xl' | '6xl' | '7xl' | 'full';
  centered?: boolean;
}

export function StandardPageLayout({
  children,
  title,
  subtitle,
  description,
  breadcrumbs,
  actions = [],
  showBackButton = false,
  backHref,
  className,
  maxWidth = '6xl',
  centered = false,
}: StandardPageLayoutProps) {
  const navigate = useNavigate();

  const maxWidthClass = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '4xl': 'max-w-4xl',
    '6xl': 'max-w-6xl',
    '7xl': 'max-w-7xl',
    full: 'max-w-full',
  }[maxWidth];

  const handleBack = () => {
    if (backHref) {
      navigate(backHref);
    } else {
      navigate(-1);
    }
  };

  return (
    <div
      className={cn(
        'min-h-screen pt-20 pb-12 px-6',
        maxWidthClass,
        'mx-auto',
        centered && 'text-center',
        className
      )}
    >
      {/* Breadcrumbs */}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="flex items-center space-x-2 text-sm text-muted-foreground mb-6">
          {breadcrumbs.map((item, index) => (
            <React.Fragment key={index}>
              {index > 0 && <span className="text-muted-foreground/50">/</span>}
              {item.href ? (
                <button
                  onClick={() => navigate(item.href!)}
                  className="hover:text-foreground transition-colors"
                >
                  {item.label}
                </button>
              ) : (
                <span
                  className={index === breadcrumbs.length - 1 ? 'text-foreground font-medium' : ''}
                >
                  {item.label}
                </span>
              )}
            </React.Fragment>
          ))}
        </nav>
      )}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 mb-8">
        <div className={cn('space-y-3', centered && 'mx-auto text-center')}>
          {showBackButton && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBack}
              className="mb-2 -ml-3 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          )}

          <div className="space-y-2">
            <h1 className="text-4xl font-bold tracking-tight">{title}</h1>

            {subtitle && <h2 className="text-xl font-medium text-muted-foreground">{subtitle}</h2>}

            {description && (
              <p className="text-lg text-muted-foreground max-w-3xl">{description}</p>
            )}
          </div>
        </div>

        {/* Page Actions */}
        {actions.length > 0 && (
          <div className="flex flex-wrap gap-3">
            {actions.map((action, index) => (
              <Button
                key={index}
                variant={action.variant || 'default'}
                onClick={action.onClick}
                disabled={action.disabled}
                className={cn(
                  action.variant !== 'default' &&
                    action.variant !== 'destructive' &&
                    'border-border/50 text-muted-foreground hover:text-foreground hover:border-primary/30'
                )}
              >
                {action.icon && <action.icon className="h-4 w-4 mr-2" />}
                {action.label}
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* Page Content */}
      <div className="space-y-8">{children}</div>
    </div>
  );
}

// Specialized layouts for common page types

// Detail Page Layout - For entity detail pages (dogs, people, shows, etc.)
export interface DetailPageLayoutProps extends Omit<StandardPageLayoutProps, 'children'> {
  header: React.ReactNode;
  tabs?: React.ReactNode;
  content: React.ReactNode;
  sidebar?: React.ReactNode;
}

export function DetailPageLayout({
  header,
  tabs,
  content,
  sidebar,
  ...pageProps
}: DetailPageLayoutProps) {
  return (
    <StandardPageLayout {...pageProps}>
      {/* Entity Header (e.g., dog photo and basic info) */}
      {header && <div className="mb-8">{header}</div>}

      {/* Tabs Navigation */}
      {tabs && <div className="mb-8">{tabs}</div>}

      {/* Content with Optional Sidebar */}
      <div className={cn('grid gap-8', sidebar ? 'grid-cols-1 lg:grid-cols-4' : 'grid-cols-1')}>
        <div className={sidebar ? 'lg:col-span-3' : 'col-span-1'}>{content}</div>
        {sidebar && <div className="lg:col-span-1">{sidebar}</div>}
      </div>
    </StandardPageLayout>
  );
}

// List Page Layout - For browsing/listing pages
export interface ListPageLayoutProps extends Omit<StandardPageLayoutProps, 'children'> {
  filters?: React.ReactNode;
  search?: React.ReactNode;
  content: React.ReactNode;
  pagination?: React.ReactNode;
}

export function ListPageLayout({
  filters,
  search,
  content,
  pagination,
  ...pageProps
}: ListPageLayoutProps) {
  return (
    <StandardPageLayout {...pageProps}>
      {/* Search and Filters */}
      {(search || filters) && (
        <div className="space-y-4 mb-8">
          {search}
          {filters}
        </div>
      )}

      {/* List Content */}
      <div className="space-y-6">{content}</div>

      {/* Pagination */}
      {pagination && <div className="mt-8">{pagination}</div>}
    </StandardPageLayout>
  );
}

// Form Page Layout - For forms and settings pages
export interface FormPageLayoutProps extends Omit<StandardPageLayoutProps, 'children'> {
  form: React.ReactNode;
  sidebar?: React.ReactNode;
}

export function FormPageLayout({
  form,
  sidebar,
  maxWidth = '4xl',
  ...pageProps
}: FormPageLayoutProps) {
  return (
    <StandardPageLayout maxWidth={maxWidth} {...pageProps}>
      <div className={cn('grid gap-8', sidebar ? 'grid-cols-1 lg:grid-cols-3' : 'grid-cols-1')}>
        <div className={sidebar ? 'lg:col-span-2' : 'col-span-1'}>{form}</div>
        {sidebar && <div className="lg:col-span-1">{sidebar}</div>}
      </div>
    </StandardPageLayout>
  );
}
