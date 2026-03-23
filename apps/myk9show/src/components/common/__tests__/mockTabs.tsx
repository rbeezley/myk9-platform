/**
 * Shared lightweight mock for Base UI Tabs primitives.
 * Uses a React context to wire onValueChange from Tabs to TabsTrigger.
 *
 * Usage in test files:
 *   vi.mock('@/components/ui/tabs', () => import('./__tests__/mockTabs'));
 *   // — or for co-located tests —
 *   vi.mock('@/components/ui/tabs', () => import('./mockTabs'));
 */
import { createContext, useContext } from 'react';

const TabsCtx = createContext<{
  value: string;
  onValueChange?: (v: string) => void;
}>({ value: '' });

export const Tabs = ({
  children,
  className,
  value,
  onValueChange,
}: {
  children: React.ReactNode;
  className?: string;
  value: string;
  onValueChange?: (v: string) => void;
}) => (
  <TabsCtx.Provider value={{ value, onValueChange }}>
    <div data-testid="tabs-root" data-value={value} className={className}>
      {children}
    </div>
  </TabsCtx.Provider>
);

export const TabsList = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <div role="tablist" className={className}>
    {children}
  </div>
);

export const TabsTrigger = ({
  children,
  className,
  value: triggerValue,
}: {
  children: React.ReactNode;
  className?: string;
  value: string;
}) => {
  const ctx = useContext(TabsCtx);
  const isActive = ctx.value === triggerValue;
  return (
    <button
      role="tab"
      className={className}
      data-value={triggerValue}
      data-state={isActive ? 'active' : 'inactive'}
      aria-selected={isActive}
      onClick={() => ctx.onValueChange?.(triggerValue)}
    >
      {children}
    </button>
  );
};

export const TabsContent = ({
  children,
  value,
  className,
}: {
  children: React.ReactNode;
  value: string;
  className?: string;
}) => (
  <div role="tabpanel" data-value={value} className={className}>
    {children}
  </div>
);
