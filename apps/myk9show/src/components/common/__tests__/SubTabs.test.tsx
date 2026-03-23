import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Filter, SortAsc } from 'lucide-react';

// Mock the Base UI Tabs with lightweight HTML equivalents.
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

import { SubTabs, SubTabsContent } from '../SubTabs';
import type { SubTabDef } from '../SubTabs';

const tabsWithIcons: SubTabDef[] = [
  { id: 'filter', label: 'Filter', icon: Filter },
  { id: 'sort', label: 'Sort', icon: SortAsc },
];

const tabsWithoutIcons: SubTabDef[] = [
  { id: 'pending', label: 'Pending' },
  { id: 'completed', label: 'Completed' },
];

describe('SubTabs', () => {
  it('renders segmented pill style with muted background container', () => {
    render(
      <SubTabs tabs={tabsWithoutIcons} value="pending" onValueChange={vi.fn()}>
        <SubTabsContent value="pending">Pending content</SubTabsContent>
      </SubTabs>
    );

    const tabList = screen.getByRole('tablist');
    expect(tabList.className).toContain('bg-muted/50');
    expect(tabList.className).toContain('rounded-lg');
    expect(tabList.className).toContain('p-1');
  });

  it('applies pill styling to tab triggers', () => {
    render(
      <SubTabs tabs={tabsWithoutIcons} value="pending" onValueChange={vi.fn()}>
        <SubTabsContent value="pending">content</SubTabsContent>
      </SubTabs>
    );

    const tabs = screen.getAllByRole('tab');
    tabs.forEach(tab => {
      expect(tab.className).toContain('rounded-md');
      expect(tab.className).toContain('px-3');
      expect(tab.className).toContain('py-1.5');
    });
  });

  it('renders icons when provided', () => {
    render(
      <SubTabs tabs={tabsWithIcons} value="filter" onValueChange={vi.fn()}>
        <SubTabsContent value="filter">content</SubTabsContent>
      </SubTabs>
    );

    const tabs = screen.getAllByRole('tab');
    tabs.forEach(tab => {
      expect(tab.querySelector('svg')).not.toBeNull();
    });
  });

  it('renders without icons when not provided', () => {
    render(
      <SubTabs tabs={tabsWithoutIcons} value="pending" onValueChange={vi.fn()}>
        <SubTabsContent value="pending">content</SubTabsContent>
      </SubTabs>
    );

    const tabs = screen.getAllByRole('tab');
    tabs.forEach(tab => {
      expect(tab.querySelector('svg')).toBeNull();
    });
  });

  it('does not render count badges (unlike PrimaryTabs)', () => {
    render(
      <SubTabs tabs={tabsWithoutIcons} value="pending" onValueChange={vi.fn()}>
        <SubTabsContent value="pending">content</SubTabsContent>
      </SubTabs>
    );

    // SubTabs have no badge support -- only label text
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('fires onValueChange when pill is clicked', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(
      <SubTabs tabs={tabsWithoutIcons} value="pending" onValueChange={handleChange}>
        <SubTabsContent value="pending">content</SubTabsContent>
      </SubTabs>
    );

    await user.click(screen.getByText('Completed'));
    expect(handleChange).toHaveBeenCalledWith('completed');
  });

  it('resets to first tab when resetKey prop changes', () => {
    const handleChange = vi.fn();

    const { rerender } = render(
      <SubTabs tabs={tabsWithoutIcons} value="completed" onValueChange={handleChange} resetKey="v1">
        <SubTabsContent value="completed">content</SubTabsContent>
      </SubTabs>
    );

    // Change resetKey -- should trigger onValueChange with first tab
    rerender(
      <SubTabs tabs={tabsWithoutIcons} value="completed" onValueChange={handleChange} resetKey="v2">
        <SubTabsContent value="completed">content</SubTabsContent>
      </SubTabs>
    );

    expect(handleChange).toHaveBeenCalledWith('pending');
  });

  it('renders children (SubTabsContent)', () => {
    render(
      <SubTabs tabs={tabsWithoutIcons} value="pending" onValueChange={vi.fn()}>
        <SubTabsContent value="pending">Pending panel content</SubTabsContent>
      </SubTabs>
    );

    expect(screen.getByText('Pending panel content')).toBeInTheDocument();
  });
});
