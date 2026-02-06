import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TabBar, type Tab } from './TabBar';

const sampleTabs: Tab[] = [
  { id: 'pending', label: 'Pending', count: 20 },
  { id: 'completed', label: 'Completed', count: 15 },
  { id: 'all', label: 'All' },
];

describe('TabBar', () => {
  it('should render all tabs', () => {
    render(
      <TabBar tabs={sampleTabs} activeTab="pending" onTabChange={() => {}} />
    );
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('All')).toBeInTheDocument();
  });

  it('should display count badges when count is provided', () => {
    render(
      <TabBar tabs={sampleTabs} activeTab="pending" onTabChange={() => {}} />
    );
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
  });

  it('should not display count when count is undefined', () => {
    render(
      <TabBar
        tabs={[{ id: 'test', label: 'Test' }]}
        activeTab="test"
        onTabChange={() => {}}
      />
    );
    // Only the label text should be present
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBe(1);
  });

  it('should call onTabChange with tab id when clicked', async () => {
    const user = userEvent.setup();
    const onTabChange = vi.fn();
    render(
      <TabBar tabs={sampleTabs} activeTab="pending" onTabChange={onTabChange} />
    );
    await user.click(screen.getByText('Completed'));
    expect(onTabChange).toHaveBeenCalledWith('completed');
  });

  it('should render tab icons when provided', () => {
    const tabs: Tab[] = [
      { id: 'tab1', label: 'Tab 1', icon: <span data-testid="icon1">I</span> },
    ];
    render(
      <TabBar tabs={tabs} activeTab="tab1" onTabChange={() => {}} />
    );
    expect(screen.getByTestId('icon1')).toBeInTheDocument();
  });

  it('should render rightElement when provided', () => {
    render(
      <TabBar
        tabs={sampleTabs}
        activeTab="pending"
        onTabChange={() => {}}
        rightElement={<button>Filter</button>}
      />
    );
    expect(screen.getByRole('button', { name: 'Filter' })).toBeInTheDocument();
  });

  it('should apply custom className', () => {
    const { container } = render(
      <TabBar
        tabs={sampleTabs}
        activeTab="pending"
        onTabChange={() => {}}
        className="custom-tabs"
      />
    );
    expect(container.firstElementChild?.className).toContain('custom-tabs');
  });

  it('should render all tabs as buttons', () => {
    render(
      <TabBar tabs={sampleTabs} activeTab="pending" onTabChange={() => {}} />
    );
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBe(3);
  });
});
