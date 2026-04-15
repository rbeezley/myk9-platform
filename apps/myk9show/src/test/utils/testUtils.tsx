import React, { ReactElement } from 'react';
import { render, RenderOptions, waitFor } from '@testing-library/react';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/context/AuthContext';
import { vi, expect } from 'vitest';
import userEvent from '@testing-library/user-event';

// Create a query client for tests with no retries and no refetch
export const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Infinity,
        refetchOnWindowFocus: false,
        refetchOnMount: false,
      },
      mutations: {
        retry: false,
      },
    },
  });

interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  initialRoute?: string;
  queryClient?: QueryClient;
  authState?: {
    isAuthenticated?: boolean;
    user?: Record<string, unknown>;
  };
}

// Custom render function with providers
// eslint-disable-next-line react-refresh/only-export-components
const AllTheProviders: React.FC<{
  children: React.ReactNode;
  initialRoute?: string;
  queryClient?: QueryClient;
}> = ({ children, initialRoute = '/', queryClient }) => {
  const client = queryClient || createTestQueryClient();

  const Router = initialRoute ? MemoryRouter : BrowserRouter;
  const routerProps = initialRoute ? { initialEntries: [initialRoute] } : {};

  return (
    <QueryClientProvider client={client}>
      <AuthProvider>
        <Router {...routerProps}>{children}</Router>
      </AuthProvider>
    </QueryClientProvider>
  );
};

const customRender = (ui: ReactElement, options?: CustomRenderOptions) => {
  const { initialRoute, queryClient, ...renderOptions } = options || {};

  return {
    user: userEvent.setup(),
    ...render(ui, {
      wrapper: ({ children }) => (
        <AllTheProviders
          {...(initialRoute !== undefined && { initialRoute })}
          {...(queryClient !== undefined && { queryClient })}
        >
          {children}
        </AllTheProviders>
      ),
      ...renderOptions,
    }),
  };
};

// Helper to wait for loading states to resolve
export const waitForLoadingToFinish = () =>
  waitFor(() => {
    const loadingElements = [
      ...document.querySelectorAll('[aria-busy="true"]'),
      ...document.querySelectorAll('[data-testid="loading"]'),
      ...document.querySelectorAll('.animate-pulse'),
    ];
    if (loadingElements.length > 0) {
      throw new Error('Still loading');
    }
  });

// Helper to mock Zustand stores
export const mockZustandStore = <T extends object>(initialState: T) => {
  const state = { ...initialState };
  const listeners = new Set<() => void>();

  return {
    getState: () => state,
    setState: (partial: Partial<T> | ((state: T) => Partial<T>)) => {
      const newState = typeof partial === 'function' ? partial(state) : partial;
      Object.assign(state, newState);
      listeners.forEach(listener => listener());
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    destroy: () => listeners.clear(),
  };
};

// Helper to create mock API responses
export const createMockResponse = <T,>(data: T, delay = 0) => {
  return vi
    .fn()
    .mockImplementation(() =>
      delay > 0
        ? new Promise(resolve => setTimeout(() => resolve({ data }), delay))
        : Promise.resolve({ data })
    );
};

// Helper to test async errors
export const expectAsyncError = async (fn: () => Promise<unknown>, errorMessage?: string) => {
  let error: Error | null = null;
  try {
    await fn();
  } catch (e) {
    error = e as Error;
  }
  expect(error).not.toBeNull();
  if (errorMessage) {
    expect(error?.message).toContain(errorMessage);
  }
  return error;
};

// eslint-disable-next-line react-refresh/only-export-components
export * from '@testing-library/react';

export { customRender as render, customRender as renderWithProviders, userEvent };
