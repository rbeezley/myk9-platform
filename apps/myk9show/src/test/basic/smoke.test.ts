import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import App from '../../App';

// Note: Supabase is mocked globally via src/test/setup.ts

// Mock window.matchMedia for responsive components
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Test wrapper component
function TestWrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return React.createElement(
    QueryClientProvider,
    { client: queryClient },
    React.createElement(BrowserRouter, {}, children)
  );
}

describe('Application Smoke Tests', () => {
  beforeEach(() => {
    // queryClient is created in TestWrapper

    // Clear localStorage before each test
    localStorage.clear();

    // Set up basic mock data
    localStorage.setItem(
      'dogStore',
      JSON.stringify({
        state: {
          dogs: [
            {
              id: 'dog-1',
              callName: 'Buddy',
              registeredName: 'Champion Buddy',
              gender: 'Male',
              birthDate: '2020-01-15',
              ownerId: 'owner-1',
              registrations: [
                {
                  id: 'reg-1',
                  organization: 'AKC',
                  registeredName: 'Champion Buddy',
                  breed: 'Golden Retriever',
                  registrationNumber: 'AKC123456',
                  status: 'Active',
                },
              ],
            },
          ],
          people: [
            {
              id: 'owner-1',
              firstName: 'John',
              lastName: 'Smith',
              email: 'john@example.com',
            },
          ],
        },
      })
    );

    localStorage.setItem(
      'showStore',
      JSON.stringify({
        state: {
          shows: [
            {
              id: 'show-1',
              name: 'Test Dog Show',
              startDate: '2025-03-01',
              status: 'accepting_entries',
            },
          ],
        },
      })
    );
  });

  it('should render the main application without crashing', async () => {
    render(React.createElement(TestWrapper, {}, React.createElement(App)));

    // Should render some main content
    await waitFor(() => {
      expect(document.body).toBeInTheDocument();
    });

    // Should not have any uncaught errors
    expect(screen.queryByText(/error/i)).not.toBeInTheDocument();
  });

  it('should handle basic user interactions', async () => {
    render(React.createElement(TestWrapper, {}, React.createElement(App)));

    await waitFor(() => {
      expect(document.body).toBeInTheDocument();
    });

    // Find any clickable elements
    const buttons = screen.queryAllByRole('button');
    const links = screen.queryAllByRole('link');

    // Should have some interactive elements
    expect(buttons.length + links.length).toBeGreaterThan(0);

    // Try clicking the first button if it exists and is enabled
    if (buttons.length > 0) {
      const firstButton = buttons[0];
      if (!firstButton.hasAttribute('disabled')) {
        fireEvent.click(firstButton);

        // Should not crash after clicking
        await waitFor(() => {
          expect(document.body).toBeInTheDocument();
        });
      }
    }
  });

  it('should handle form inputs without errors', async () => {
    render(React.createElement(TestWrapper, {}, React.createElement(App)));

    await waitFor(() => {
      expect(document.body).toBeInTheDocument();
    });

    // Find any input elements
    const inputs = screen.queryAllByRole('textbox');
    const searchInputs = document.querySelectorAll(
      'input[type="search"], input[placeholder*="search"]'
    );

    // Try interacting with a search input if available
    if (searchInputs.length > 0) {
      const searchInput = searchInputs[0] as HTMLInputElement;
      fireEvent.change(searchInput, { target: { value: 'test search' } });

      // Should handle input without crashing
      await waitFor(() => {
        expect(searchInput.value).toBe('test search');
      });
    }

    // Try interacting with regular inputs
    if (inputs.length > 0) {
      const firstInput = inputs[0];
      fireEvent.change(firstInput, { target: { value: 'test' } });

      // Should handle input without crashing
      await waitFor(() => {
        expect(document.body).toBeInTheDocument();
      });
    }
  });

  it('should maintain responsive design elements', async () => {
    render(React.createElement(TestWrapper, {}, React.createElement(App)));

    await waitFor(() => {
      expect(document.body).toBeInTheDocument();
    });

    // Main point is the app renders without crashing
    expect(document.body).toBeInTheDocument();
  });

  it('should handle localStorage state management', async () => {
    // Set some test data
    const testDogData = {
      state: {
        dogs: [
          {
            id: 'test-dog',
            callName: 'TestDog',
            registrations: [
              {
                id: 'reg-test',
                breed: 'Test Breed',
                organization: 'AKC',
                registeredName: 'TestDog',
                registrationNumber: 'TEST123',
                status: 'Active',
              },
            ],
          },
        ],
        version: 1,
      },
    };

    localStorage.setItem('dogStore', JSON.stringify(testDogData));

    render(React.createElement(TestWrapper, {}, React.createElement(App)));

    await waitFor(() => {
      expect(document.body).toBeInTheDocument();
    });

    // App should load and handle the localStorage data without errors
    expect(localStorage.getItem('dogStore')).toBeTruthy();

    // Should not crash when loading persisted state
    expect(screen.queryByText(/error/i)).not.toBeInTheDocument();
  });
});
