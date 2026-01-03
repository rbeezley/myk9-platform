import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Loading Spinner Component
const LoadingSpinner = ({ size = 'md', text }: { size?: 'sm' | 'md' | 'lg'; text?: string }) => {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8', 
    lg: 'h-12 w-12'
  };

  return (
    <div className="flex flex-col items-center justify-center p-4" data-testid="loading-spinner">
      <div 
        className={`animate-spin rounded-full border-2 border-gray-300 border-t-blue-600 ${sizeClasses[size]}`}
        aria-label="Loading"
      />
      {text && <p className="mt-2 text-sm text-gray-600">{text}</p>}
    </div>
  );
};

// Skeleton Loader Component
const SkeletonLoader = ({ lines = 3, width = '100%' }: { lines?: number; width?: string }) => (
  <div className="animate-pulse" data-testid="skeleton-loader">
    {Array.from({ length: lines }).map((_, index) => (
      <div 
        key={index}
        className={`h-4 bg-gray-200 rounded mb-2 ${index === lines - 1 ? 'w-3/4' : 'w-full'}`}
        style={{ width: index === 0 ? width : undefined }}
      />
    ))}
  </div>
);

// Button with Loading State
const LoadingButton = ({ 
  children, 
  onClick, 
  loading = false, 
  disabled = false,
  ...props 
}: {
  children: React.ReactNode;
  onClick?: () => void;
  loading?: boolean;
  disabled?: boolean;
  [key: string]: unknown;
}) => (
  <button
    onClick={onClick}
    disabled={loading || disabled}
    className={`px-4 py-2 rounded flex items-center gap-2 ${
      loading || disabled 
        ? 'bg-gray-300 cursor-not-allowed' 
        : 'bg-blue-500 hover:bg-blue-600 text-white'
    }`}
    {...props}
  >
    {loading && (
      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
    )}
    {children}
  </button>
);

// Data Loading Component (simulates async data fetching)
const DataLoader = ({ delay = 1000 }: { delay?: number }) => {
  const [loading, setLoading] = React.useState(true);
  const [data, setData] = React.useState<string[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, delay));
        
        setData(['Item 1', 'Item 2', 'Item 3']);
      } catch {
        setError('Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [delay]);

  if (loading) {
    return <LoadingSpinner text="Loading data..." />;
  }

  if (error) {
    return <div data-testid="error-state" className="text-red-500">{error}</div>;
  }

  return (
    <div data-testid="data-content">
      {data?.map((item, index) => (
        <div key={index}>{item}</div>
      ))}
    </div>
  );
};

// Progressive Loading Component
const ProgressiveLoader = () => {
  const [step, setStep] = React.useState(0);
  const steps = ['Loading user...', 'Loading preferences...', 'Loading data...', 'Complete!'];

  React.useEffect(() => {
    const interval = setInterval(() => {
      setStep(prev => {
        if (prev < steps.length - 1) {
          return prev + 1;
        }
        clearInterval(interval);
        return prev;
      });
    }, 800);

    return () => clearInterval(interval);
  }, [steps.length]);

  if (step === steps.length - 1) {
    return <div data-testid="complete">Loading complete!</div>;
  }

  return (
    <div data-testid="progressive-loader">
      <LoadingSpinner text={steps[step]} />
      <div className="mt-2">
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${((step + 1) / steps.length) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
};

describe('Loading States', () => {
  describe('LoadingSpinner', () => {
    it('should render loading spinner', () => {
      render(<LoadingSpinner />);
      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
      expect(screen.getByLabelText('Loading')).toBeInTheDocument();
    });

    it('should render with different sizes', () => {
      const { rerender } = render(<LoadingSpinner size="sm" />);
      let spinner = screen.getByLabelText('Loading');
      expect(spinner).toHaveClass('h-4', 'w-4');

      rerender(<LoadingSpinner size="lg" />);
      spinner = screen.getByLabelText('Loading');
      expect(spinner).toHaveClass('h-12', 'w-12');
    });

    it('should render with custom text', () => {
      render(<LoadingSpinner text="Please wait..." />);
      expect(screen.getByText('Please wait...')).toBeInTheDocument();
    });

    it('should have accessibility attributes', () => {
      render(<LoadingSpinner />);
      const spinner = screen.getByLabelText('Loading');
      expect(spinner).toHaveAttribute('aria-label', 'Loading');
    });

    it('should have animation classes', () => {
      render(<LoadingSpinner />);
      const spinner = screen.getByLabelText('Loading');
      expect(spinner).toHaveClass('animate-spin');
    });
  });

  describe('SkeletonLoader', () => {
    it('should render skeleton placeholder', () => {
      render(<SkeletonLoader />);
      expect(screen.getByTestId('skeleton-loader')).toBeInTheDocument();
    });

    it('should render specified number of lines', () => {
      render(<SkeletonLoader lines={5} />);
      const skeleton = screen.getByTestId('skeleton-loader');
      const lines = skeleton.querySelectorAll('div');
      expect(lines).toHaveLength(5);
    });

    it('should have animation classes', () => {
      render(<SkeletonLoader />);
      const skeleton = screen.getByTestId('skeleton-loader');
      expect(skeleton).toHaveClass('animate-pulse');
    });

    it('should render with custom width', () => {
      render(<SkeletonLoader width="50%" />);
      const skeleton = screen.getByTestId('skeleton-loader');
      const firstLine = skeleton.querySelector('div');
      expect(firstLine).toHaveStyle({ width: '50%' });
    });
  });

  describe('LoadingButton', () => {
    it('should render button with children', () => {
      render(<LoadingButton>Click me</LoadingButton>);
      expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
    });

    it('should show loading state', () => {
      render(<LoadingButton loading>Saving...</LoadingButton>);
      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
      expect(button.querySelector('.animate-spin')).toBeInTheDocument();
    });

    it('should be disabled when loading', () => {
      render(<LoadingButton loading>Save</LoadingButton>);
      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
    });

    it('should handle click events when not loading', async () => {
      const handleClick = vi.fn();
      const user = userEvent.setup();

      render(<LoadingButton onClick={handleClick}>Click</LoadingButton>);
      
      await user.click(screen.getByRole('button'));
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('should not handle click events when loading', async () => {
      const handleClick = vi.fn();
      const user = userEvent.setup();

      render(<LoadingButton loading onClick={handleClick}>Click</LoadingButton>);
      
      await user.click(screen.getByRole('button'));
      expect(handleClick).not.toHaveBeenCalled();
    });

    it('should apply correct styles when loading', () => {
      render(<LoadingButton loading>Loading</LoadingButton>);
      const button = screen.getByRole('button');
      expect(button).toHaveClass('bg-gray-300', 'cursor-not-allowed');
    });

    it('should apply correct styles when not loading', () => {
      render(<LoadingButton>Normal</LoadingButton>);
      const button = screen.getByRole('button');
      expect(button).toHaveClass('bg-blue-500');
    });
  });

  describe('DataLoader (Async Loading)', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should show loading state initially', () => {
      render(<DataLoader />);
      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
      expect(screen.getByText('Loading data...')).toBeInTheDocument();
    });

    it('should show data after loading completes', async () => {
      render(<DataLoader delay={100} />);
      
      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
      
      // Fast forward time
      vi.advanceTimersByTime(100);
      
      await waitFor(() => {
        expect(screen.getByTestId('data-content')).toBeInTheDocument();
        expect(screen.getByText('Item 1')).toBeInTheDocument();
        expect(screen.getByText('Item 2')).toBeInTheDocument();
        expect(screen.getByText('Item 3')).toBeInTheDocument();
      });
      
      expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
    });

    it('should handle different loading delays', async () => {
      render(<DataLoader delay={500} />);
      
      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
      
      // Fast forward less than delay
      vi.advanceTimersByTime(200);
      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
      
      // Fast forward to complete delay
      vi.advanceTimersByTime(300);
      
      await waitFor(() => {
        expect(screen.getByTestId('data-content')).toBeInTheDocument();
      });
    });
  });

  describe('ProgressiveLoader', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should show progressive loading steps', async () => {
      render(<ProgressiveLoader />);
      
      expect(screen.getByText('Loading user...')).toBeInTheDocument();
      
      vi.advanceTimersByTime(800);
      await waitFor(() => {
        expect(screen.getByText('Loading preferences...')).toBeInTheDocument();
      });
      
      vi.advanceTimersByTime(800);
      await waitFor(() => {
        expect(screen.getByText('Loading data...')).toBeInTheDocument();
      });
      
      vi.advanceTimersByTime(800);
      await waitFor(() => {
        expect(screen.getByTestId('complete')).toBeInTheDocument();
        expect(screen.getByText('Loading complete!')).toBeInTheDocument();
      });
    });

    it('should show progress bar', () => {
      render(<ProgressiveLoader />);
      const progressBar = screen.getByTestId('progressive-loader').querySelector('.bg-blue-600');
      expect(progressBar).toBeInTheDocument();
    });

    it('should update progress bar width', async () => {
      render(<ProgressiveLoader />);
      
      const getProgressWidth = () => {
        const progressBar = screen.getByTestId('progressive-loader').querySelector('.bg-blue-600');
        return progressBar?.getAttribute('style');
      };
      
      // Initial state should be 25% (step 1 of 4)
      expect(getProgressWidth()).toContain('25%');
      
      vi.advanceTimersByTime(800);
      await waitFor(() => {
        expect(getProgressWidth()).toContain('50%');
      });
    });
  });

  describe('Loading State Transitions', () => {
    it('should handle multiple loading states in sequence', async () => {
      const MultiStateComponent = () => {
        const [state, setState] = React.useState<'idle' | 'loading' | 'success' | 'error'>('idle');
        
        const handleLoad = async () => {
          setState('loading');
          try {
            await new Promise(resolve => setTimeout(resolve, 100));
            setState('success');
          } catch {
            setState('error');
          }
        };

        return (
          <div>
            {state === 'idle' && <button onClick={handleLoad}>Start Loading</button>}
            {state === 'loading' && <LoadingSpinner text="Processing..." />}
            {state === 'success' && <div data-testid="success">Success!</div>}
            {state === 'error' && <div data-testid="error">Error occurred</div>}
          </div>
        );
      };

      const user = userEvent.setup();
      render(<MultiStateComponent />);
      
      const startButton = screen.getByText('Start Loading');
      await user.click(startButton);
      
      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
      
      await waitFor(() => {
        expect(screen.getByTestId('success')).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('should announce loading state to screen readers', () => {
      render(<LoadingSpinner text="Loading content" />);
      expect(screen.getByLabelText('Loading')).toBeInTheDocument();
      expect(screen.getByText('Loading content')).toBeInTheDocument();
    });

    it('should properly disable interactive elements during loading', () => {
      render(<LoadingButton loading>Submit</LoadingButton>);
      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('disabled');
    });

    it('should provide appropriate ARIA attributes for loading states', () => {
      const ComponentWithAria = ({ loading }: { loading: boolean }) => (
        <div aria-busy={loading} aria-live="polite">
          {loading ? <LoadingSpinner /> : <div>Content loaded</div>}
        </div>
      );

      const { rerender } = render(<ComponentWithAria loading={true} />);
      let container = screen.getByRole('status');
      expect(container).toHaveAttribute('aria-busy', 'true');

      rerender(<ComponentWithAria loading={false} />);
      container = screen.getByRole('status');
      expect(container).toHaveAttribute('aria-busy', 'false');
    });
  });
});