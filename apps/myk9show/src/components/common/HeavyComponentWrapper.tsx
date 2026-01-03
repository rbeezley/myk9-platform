/**
 * HeavyComponentWrapper - Wrapper for heavy/lazy-loaded components
 * 
 * Provides consistent loading states and error boundaries for components
 * that have been code-split for performance optimization
 */

import React from 'react';
import { SuspenseWrapper } from '@/routes/utils/SuspenseWrapper';
import { 
  CalendarSkeleton, 
  DashboardSkeleton, 
  TableSkeleton, 
  FormSkeleton 
} from './SkeletonLoaders';

type ComponentType = 'calendar' | 'dashboard' | 'table' | 'form' | 'chart' | 'editor';

interface HeavyComponentWrapperProps {
  children: React.ReactNode;
  type: ComponentType;
  fallback?: React.ReactNode;
  timeout?: number;
}

const getSkeletonForType = (type: ComponentType): React.ReactNode => {
  switch (type) {
    case 'calendar':
      return <CalendarSkeleton />;
    case 'dashboard':
    case 'chart':
      return <DashboardSkeleton />;
    case 'table':
      return <TableSkeleton />;
    case 'form':
    case 'editor':
      return <FormSkeleton />;
    default:
      return <DashboardSkeleton />;
  }
};

export const HeavyComponentWrapper: React.FC<HeavyComponentWrapperProps> = ({
  children,
  type,
  fallback,
  timeout = 15000 // Longer timeout for heavy components
}) => {
  const skeletonFallback = fallback || getSkeletonForType(type);

  return (
    <SuspenseWrapper 
      fallback={skeletonFallback} 
      timeout={timeout}
      errorFallback={(error, retry) => (
        <div className="flex flex-col items-center justify-center p-8 border border-border rounded-lg bg-card">
          <div className="text-center max-w-md">
            <div className="text-destructive mb-4">
              <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold mb-2">Failed to load component</h3>
            <p className="text-sm text-muted-foreground mb-4">
              This component couldn't load. This might be due to a network issue or the component being temporarily unavailable.
            </p>
            <div className="flex gap-2 justify-center">
              <button
                onClick={retry}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors text-sm"
              >
                Try Again
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 border border-input rounded-md hover:bg-accent hover:text-accent-foreground transition-colors text-sm"
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      )}
    >
      {children}
    </SuspenseWrapper>
  );
};

// Convenience wrappers for specific component types
export const CalendarWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <HeavyComponentWrapper type="calendar">{children}</HeavyComponentWrapper>
);

export const DashboardWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <HeavyComponentWrapper type="dashboard">{children}</HeavyComponentWrapper>
);

export const TableWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <HeavyComponentWrapper type="table">{children}</HeavyComponentWrapper>
);

export const ChartWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <HeavyComponentWrapper type="chart">{children}</HeavyComponentWrapper>
);

export const EditorWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <HeavyComponentWrapper type="editor">{children}</HeavyComponentWrapper>
);

export default HeavyComponentWrapper;