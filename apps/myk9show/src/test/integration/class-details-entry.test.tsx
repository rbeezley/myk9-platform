import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import ClassDetailsPage from '@/pages/ClassDetailsPage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock stores
vi.mock('@/store/classStore', () => ({
  useClassStore: () => ({
    classes: [{
      id: 'test-class-1',
      className: 'Test Class',
      trialId: 'test-trial-1',
      trial: 'Test Trial',
      trialDate: new Date(),
      judge: 'Test Judge',
      classOrder: 1,
      entryFee: 25,
      maxEntries: 50,
      timeLimit1: '3:00',
      trialNumber: '12345',
      status: 'Scheduled',
      element: 'Interior',
      level: 'Novice',
      section: 'A'
    }],
    updateClass: vi.fn(),
    deleteClass: vi.fn()
  })
}));

vi.mock('@/store/entryStore', () => ({
  useEntryStore: () => ({
    entries: [],
    clearAllEntries: vi.fn(),
    createMultipleEntries: vi.fn(),
    updateResult: vi.fn()
  })
}));

vi.mock('@/store/dogStore', () => ({
  useDogStore: () => ({
    dogs: []
  })
}));

vi.mock('@/store/trialStore', () => ({
  useTrialStore: () => ({
    trials: []
  })
}));

vi.mock('@/store/showStore', () => ({
  useShowStore: () => ({
    shows: []
  })
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    user: { id: 'test-user', email: 'test@example.com' },
    hasRole: () => true
  })
}));

describe('ClassDetailsPage Entry Management', () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false }
    }
  });

  const renderPage = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <ClassDetailsPage />
        </BrowserRouter>
      </QueryClientProvider>
    );
  };

  it('should render Add Entry button', () => {
    renderPage();
    
    const addButton = screen.getByRole('button', { name: /add entry/i });
    expect(addButton).toBeInTheDocument();
  });

  it('should have RegistrationProvider wrapper for RegistrationWorkflow', () => {
    // This test verifies that the fix is in place
    // The component should render without throwing the 
    // "useRegistrationContext must be used within a RegistrationProvider" error
    expect(() => renderPage()).not.toThrow();
  });
});