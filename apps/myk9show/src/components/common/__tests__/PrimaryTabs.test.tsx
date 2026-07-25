import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { List, Settings, Users } from 'lucide-react';
import { StatusIcon } from '@/components/status';
import { render } from '@/test/utils/testUtils';

vi.mock('@/components/ui/tabs', () => import('./mockTabs'));

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

  it('renders shared semantic icon elements', () => {
    render(
      <PrimaryTabs
        tabs={[
          {
            id: 'pending',
            label: 'Pending',
            icon: <StatusIcon family="entry" status="pending" size="sm" decorative />,
          },
        ]}
        value="pending"
        onValueChange={vi.fn()}
      />
    );

    expect(document.querySelector('[data-family="entry"][data-status="pending"]')).not.toBeNull();
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
    expect(tabList.className).toContain('max-w-full');
  });

  it('keeps long labels in non-overlapping scrollable triggers', () => {
    render(
      <PrimaryTabs
        tabs={[
          { id: 'alerts', label: 'Alert Monitoring' },
          { id: 'sync', label: 'Sync Monitoring' },
          { id: 'performance', label: 'Performance Dashboard' },
        ]}
        value="alerts"
        onValueChange={vi.fn()}
      />
    );

    const tabs = screen.getAllByRole('tab');
    tabs.forEach(tab => {
      expect(tab.className).toContain('min-w-max');
      expect(tab.className).toContain('whitespace-nowrap');
    });
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
