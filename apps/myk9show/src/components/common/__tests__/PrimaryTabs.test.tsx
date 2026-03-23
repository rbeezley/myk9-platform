import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { List, Settings, Users } from 'lucide-react';

// Mock the Base UI Tabs with lightweight HTML equivalents.
// Uses a React context internally to wire onValueChange from Tabs to TabsTrigger.
vi.mock('@/components/ui/tabs', async () => {
  const { createContext, useContext } = await import('react');

  const TabsCtx = createContext<{
    value: string;
    onValueChange?: (v: string) => void;
  }>({ value: '' });

  return {
    Tabs: ({
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
    ),
    TabsList: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div role="tablist" className={className}>
        {children}
      </div>
    ),
    TabsTrigger: ({
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
    },
    TabsContent: ({
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
    ),
  };
});

import { PrimaryTabs, TabsContent } from '../PrimaryTabs';
import type { PrimaryTabDef } from '../PrimaryTabs';

const tabsWithIcons: PrimaryTabDef[] = [
  { id: 'classes', label: 'Classes', icon: List, count: 5 },
  { id: 'entries', label: 'Entries', icon: Users, count: 12 },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const tabsWithoutIcons: PrimaryTabDef[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'details', label: 'Details' },
];

describe('PrimaryTabs', () => {
  it('renders tabs with labels', () => {
    render(
      <PrimaryTabs tabs={tabsWithIcons} value="classes" onValueChange={vi.fn()}>
        <TabsContent value="classes">Classes content</TabsContent>
      </PrimaryTabs>
    );

    expect(screen.getByText('Classes')).toBeInTheDocument();
    expect(screen.getByText('Entries')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('renders count badges when provided', () => {
    render(
      <PrimaryTabs tabs={tabsWithIcons} value="classes" onValueChange={vi.fn()}>
        <TabsContent value="classes">content</TabsContent>
      </PrimaryTabs>
    );

    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('renders without badges when count prop is not provided', () => {
    render(
      <PrimaryTabs tabs={tabsWithoutIcons} value="overview" onValueChange={vi.fn()}>
        <TabsContent value="overview">content</TabsContent>
      </PrimaryTabs>
    );

    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Details')).toBeInTheDocument();
  });

  it('renders without icons when icon prop is not provided', () => {
    render(
      <PrimaryTabs tabs={tabsWithoutIcons} value="overview" onValueChange={vi.fn()}>
        <TabsContent value="overview">content</TabsContent>
      </PrimaryTabs>
    );

    const tabs = screen.getAllByRole('tab');
    tabs.forEach(tab => {
      expect(tab.querySelector('svg')).toBeNull();
    });
  });

  it('renders icons when provided', () => {
    render(
      <PrimaryTabs tabs={tabsWithIcons} value="classes" onValueChange={vi.fn()}>
        <TabsContent value="classes">content</TabsContent>
      </PrimaryTabs>
    );

    const tabs = screen.getAllByRole('tab');
    tabs.forEach(tab => {
      expect(tab.querySelector('svg')).not.toBeNull();
    });
  });

  it('has min-height of 48px on tab triggers (touch target)', () => {
    render(
      <PrimaryTabs tabs={tabsWithIcons} value="classes" onValueChange={vi.fn()}>
        <TabsContent value="classes">content</TabsContent>
      </PrimaryTabs>
    );

    const tabs = screen.getAllByRole('tab');
    tabs.forEach(tab => {
      expect(tab.className).toContain('min-h-[48px]');
    });
  });

  it('has overflow-x-auto on the tab list container', () => {
    render(
      <PrimaryTabs tabs={tabsWithIcons} value="classes" onValueChange={vi.fn()}>
        <TabsContent value="classes">content</TabsContent>
      </PrimaryTabs>
    );

    const tabList = screen.getByRole('tablist');
    expect(tabList.className).toContain('overflow-x-auto');
  });

  it('fires onValueChange when tab is clicked', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(
      <PrimaryTabs tabs={tabsWithIcons} value="classes" onValueChange={handleChange}>
        <TabsContent value="classes">content</TabsContent>
      </PrimaryTabs>
    );

    await user.click(screen.getByText('Entries'));
    expect(handleChange).toHaveBeenCalledWith('entries');
  });

  it('marks active tab with border-bottom styling', () => {
    render(
      <PrimaryTabs tabs={tabsWithIcons} value="classes" onValueChange={vi.fn()}>
        <TabsContent value="classes">content</TabsContent>
      </PrimaryTabs>
    );

    const tabs = screen.getAllByRole('tab');
    tabs.forEach(tab => {
      expect(tab.className).toContain('border-b-2');
    });
  });

  it('renders children (TabsContent)', () => {
    render(
      <PrimaryTabs tabs={tabsWithIcons} value="classes" onValueChange={vi.fn()}>
        <TabsContent value="classes">Classes panel content</TabsContent>
      </PrimaryTabs>
    );

    expect(screen.getByText('Classes panel content')).toBeInTheDocument();
  });
});
