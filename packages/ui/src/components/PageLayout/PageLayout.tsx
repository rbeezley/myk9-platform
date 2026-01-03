import * as React from 'react';
import { cn } from '../../utils/cn';

export interface PageLayoutProps {
  /** Page content */
  children: React.ReactNode;
  /** Page title */
  title: string;
  /** Subtitle or description */
  subtitle?: string;
  /** Actions to display in the header (buttons, menus, etc.) */
  actions?: React.ReactNode;
  /** Maximum width of the content area */
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
  /** Additional className for the container */
  className?: string;
  /** Additional className for the content area */
  contentClassName?: string;
}

const maxWidthClasses = {
  sm: 'max-w-screen-sm',
  md: 'max-w-screen-md',
  lg: 'max-w-screen-lg',
  xl: 'max-w-[1200px]',
  '2xl': 'max-w-screen-2xl',
  full: 'max-w-full',
};

/**
 * PageLayout Component
 *
 * A consistent page wrapper for entity detail pages with:
 * - Centered content with configurable max-width
 * - Title and optional subtitle
 * - Actions area for buttons/menus
 * - Responsive padding
 *
 * @example
 * ```tsx
 * <PageLayout
 *   title="Show Details"
 *   subtitle="AKC Scent Work Trial - January 2026"
 *   actions={
 *     <>
 *       <Button variant="outline">Edit</Button>
 *       <Button>Save</Button>
 *     </>
 *   }
 * >
 *   <ShowContent />
 * </PageLayout>
 * ```
 */
export const PageLayout = React.forwardRef<HTMLDivElement, PageLayoutProps>(
  (
    {
      children,
      title,
      subtitle,
      actions,
      maxWidth = 'xl',
      className,
      contentClassName,
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={cn('w-full flex justify-center pt-20', className)}
      >
        <div
          className={cn(
            'w-full px-4',
            maxWidthClasses[maxWidth],
            contentClassName
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
                {subtitle && (
                  <p className="text-muted-foreground">{subtitle}</p>
                )}
              </div>
            </div>
            {actions && (
              <div className="flex items-center gap-2">{actions}</div>
            )}
          </div>

          {/* Content */}
          {children}
        </div>
      </div>
    );
  }
);

PageLayout.displayName = 'PageLayout';
