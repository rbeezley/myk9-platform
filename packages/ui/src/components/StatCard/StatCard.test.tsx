import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Users } from 'lucide-react';
import { StatCard, StatCardSkeleton } from './StatCard';

describe('StatCard', () => {
  it('should render icon, title, and value', () => {
    render(<StatCard icon={Users} title="Total Entries" value={142} />);
    expect(screen.getByText('Total Entries')).toBeInTheDocument();
    expect(screen.getByText('142')).toBeInTheDocument();
  });

  it('should render string values', () => {
    render(<StatCard icon={Users} title="Rate" value="62.7%" />);
    expect(screen.getByText('62.7%')).toBeInTheDocument();
  });

  it('should render subtitle when provided', () => {
    render(<StatCard icon={Users} title="Entries" value={42} subtitle="Active: 38" />);
    expect(screen.getByText('Active: 38')).toBeInTheDocument();
  });

  it('should not render subtitle when not provided', () => {
    render(<StatCard icon={Users} title="Entries" value={42} />);
    expect(screen.queryByText('Active:')).not.toBeInTheDocument();
  });

  it('should render progress bar when progress provided', () => {
    const { container } = render(
      <StatCard icon={Users} title="Entries" value={42} progress={75} />
    );
    const progressBar = container.querySelector('[role="progressbar"]');
    expect(progressBar).toBeInTheDocument();
    expect(progressBar).toHaveAttribute('aria-valuenow', '75');
  });

  it('should not render progress bar when progress not provided', () => {
    const { container } = render(<StatCard icon={Users} title="Entries" value={42} />);
    expect(container.querySelector('[role="progressbar"]')).not.toBeInTheDocument();
  });

  it('should clamp progress to 0-100', () => {
    const { container } = render(
      <StatCard icon={Users} title="Entries" value={42} progress={150} />
    );
    const progressBar = container.querySelector('[role="progressbar"]');
    expect(progressBar).toHaveAttribute('aria-valuenow', '100');
  });

  it('should render trend badge when provided', () => {
    render(<StatCard icon={Users} title="Shows" value={8} trend="+12%" />);
    expect(screen.getByText('+12%')).toBeInTheDocument();
  });

  it('should style positive trends in emerald', () => {
    render(<StatCard icon={Users} title="Shows" value={8} trend="+12%" />);
    const trend = screen.getByText('+12%');
    expect(trend.className).toMatch(/emerald/);
  });

  it('should style negative trends in red', () => {
    render(<StatCard icon={Users} title="Shows" value={8} trend="-5%" />);
    const trend = screen.getByText('-5%');
    expect(trend.className).toMatch(/red/);
  });

  it('should style neutral trends in muted', () => {
    render(<StatCard icon={Users} title="Shows" value={8} trend="8 total" />);
    const trend = screen.getByText('8 total');
    expect(trend.className).toMatch(/muted/);
    expect(trend.className).not.toMatch(/emerald/);
    expect(trend.className).not.toMatch(/red/);
  });

  it('should add cursor-pointer when onClick provided', () => {
    const handleClick = vi.fn();
    const { container } = render(
      <StatCard icon={Users} title="Users" value={100} onClick={handleClick} />
    );
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain('cursor-pointer');
  });

  it('should call onClick when clicked', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(<StatCard icon={Users} title="Users" value={100} onClick={handleClick} />);
    await user.click(screen.getByText('100'));
    expect(handleClick).toHaveBeenCalledOnce();
  });

  it('should add role=button and tabIndex when onClick provided', () => {
    const handleClick = vi.fn();
    const { container } = render(
      <StatCard icon={Users} title="Users" value={100} onClick={handleClick} />
    );
    const card = container.firstChild as HTMLElement;
    expect(card).toHaveAttribute('role', 'button');
    expect(card).toHaveAttribute('tabindex', '0');
  });

  it('should fire onClick on Enter key', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    const { container } = render(
      <StatCard icon={Users} title="Users" value={100} onClick={handleClick} />
    );
    const card = container.firstChild as HTMLElement;
    card.focus();
    await user.keyboard('{Enter}');
    expect(handleClick).toHaveBeenCalledOnce();
  });

  it('should not add role=button when onClick not provided', () => {
    const { container } = render(<StatCard icon={Users} title="Users" value={100} />);
    expect(container.firstChild).not.toHaveAttribute('role');
  });

  it('should apply custom className', () => {
    const { container } = render(
      <StatCard icon={Users} title="Test" value={1} className="custom-class" />
    );
    expect(container.firstChild).toHaveClass('custom-class');
  });

  describe('color variants', () => {
    it.each(['primary', 'emerald', 'amber', 'red', 'purple', 'blue'] as const)(
      'should render %s color variant',
      color => {
        render(<StatCard icon={Users} title="Test" value={1} color={color} />);
        expect(screen.getByText('Test')).toBeInTheDocument();
      }
    );

    it('should default to primary when no color specified', () => {
      const { container } = render(<StatCard icon={Users} title="Test" value={1} />);
      const iconBg = container.querySelector('[data-slot="icon"]');
      expect(iconBg?.className).toMatch(/indigo/);
    });
  });
});

describe('StatCardSkeleton', () => {
  it('should render skeleton placeholders', () => {
    const { container } = render(<StatCardSkeleton />);
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('should have same outer dimensions as StatCard', () => {
    const { container } = render(<StatCardSkeleton />);
    const skeleton = container.firstChild as HTMLElement;
    expect(skeleton.className).toContain('rounded-xl');
    expect(skeleton.className).toContain('p-5');
  });
});
