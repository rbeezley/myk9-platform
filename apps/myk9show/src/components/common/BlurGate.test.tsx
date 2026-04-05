import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { BlurGate } from './BlurGate';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

describe('BlurGate', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it('renders children directly when not locked', () => {
    render(
      <BlurGate locked={false} title="Title Progress" description="Track your titles">
        <div>premium content</div>
      </BlurGate>
    );
    expect(screen.getByText('premium content')).toBeInTheDocument();
    expect(screen.queryByText('Premium Feature')).not.toBeInTheDocument();
  });

  it('renders children when locked (data still fetches)', () => {
    render(
      <BlurGate locked={true} title="Title Progress" description="Track your titles">
        <div>premium content</div>
      </BlurGate>
    );
    expect(screen.getByText('premium content')).toBeInTheDocument();
  });

  it('shows overlay with title and description when locked', () => {
    render(
      <BlurGate locked={true} title="Title Progress" description="Track your titles">
        <div>premium content</div>
      </BlurGate>
    );
    expect(screen.getByText('Premium Feature')).toBeInTheDocument();
    expect(screen.getByText('Title Progress')).toBeInTheDocument();
    expect(screen.getByText('Track your titles')).toBeInTheDocument();
  });

  it('does not show overlay when not locked', () => {
    render(
      <BlurGate locked={false} title="Title Progress" description="Track your titles">
        <div>premium content</div>
      </BlurGate>
    );
    expect(screen.queryByText('Premium Feature')).not.toBeInTheDocument();
  });

  it('applies min-h to container when locked so overlay is usable on empty content', () => {
    const { container } = render(
      <BlurGate locked={true} title="Title Progress" description="Track your titles">
        <div style={{ height: 0 }} />
      </BlurGate>
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toMatch(/min-h-\[240px\]/);
  });

  it('navigates to /pricing-page when upgrade button is clicked', async () => {
    const { user } = render(
      <BlurGate locked={true} title="Title Progress" description="Track your titles">
        <div>premium content</div>
      </BlurGate>
    );
    await user.click(screen.getByRole('button', { name: /upgrade to premium/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/pricing-page');
  });
});
