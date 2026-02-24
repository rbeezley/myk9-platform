import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import * as fs from 'fs';
import * as path from 'path';

// Mock all dependencies
vi.mock('../../store/showRegistrationStore', () => ({
  useShowRegistrationStore: () => ({
    registrationData: { selectedDogs: [] },
    handlerAssignments: {},
    setHandlerAssignments: vi.fn(),
    paymentData: {},
    confirmRegistration: vi.fn(),
    currentRegistration: null,
    updatePaymentStatus: vi.fn(),
    updateEntryStatus: vi.fn(),
    setDraftData: vi.fn(),
    draftData: null,
    clearDraft: vi.fn(),
    setRegistrationData: vi.fn(),
    setPaymentData: vi.fn(),
  }),
}));

vi.mock('../../hooks/useRegistrationPermissions', () => ({
  useRegistrationPermissions: () => ({
    canViewAllDogs: false,
    canCreateExhibitor: false,
    canBulkOperations: false,
    canAdvancedSearch: false,
  }),
}));

vi.mock('../../context/RegistrationContext', async () => {
  const { default: React } = await vi.importActual<typeof import('react')>('react');
  const ctx = React.createContext(undefined);
  return {
    useRegistrationContext: () => ({
      mode: 'exhibitor',
      canViewAllDogs: false,
      canCreateExhibitor: false,
      workflowConfig: {
        steps: ['dog-selection', 'class-selection', 'payment', 'confirmation'],
        features: {
          bulkSelection: false,
          createNew: false,
          advancedSearch: false,
          handlerAssignment: false,
          paymentOverride: false,
          statusManagement: false,
        },
        smartDefaults: {
          autoAssignHandler: true,
          autoCalculateFees: true,
          delayRegistrationCreation: false,
        },
      },
    }),
    RegistrationProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    RegistrationContextProvider: ctx,
  };
});

vi.mock('../../hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    user: { id: 'test-user', email: 'test@example.com' },
    loading: false,
    hasRole: vi.fn().mockReturnValue(false),
    hasPermission: vi.fn().mockReturnValue(false),
    getUserRoles: vi.fn().mockReturnValue(['exhibitor']),
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    resetPassword: vi.fn(),
    updatePassword: vi.fn(),
    updateProfile: vi.fn(),
    switchUserRole: vi.fn(),
    userWithRoles: null,
  }),
}));

vi.mock('../../hooks/useRegistrationContext', () => ({
  useRegistrationContext: () => ({
    mode: 'exhibitor',
    canViewAllDogs: false,
    canCreateExhibitor: false,
    workflowConfig: {
      steps: ['dog-selection', 'class-selection', 'payment', 'confirmation'],
      features: {
        bulkSelection: false,
        createNew: false,
        advancedSearch: false,
        handlerAssignment: false,
        paymentOverride: false,
        statusManagement: false,
      },
      smartDefaults: {
        autoAssignHandler: true,
        autoCalculateFees: true,
        delayRegistrationCreation: false,
      },
    },
  }),
}));

vi.mock('../../store/dogStore', () => ({
  useDogStore: () => ({ dogs: [] }),
}));

vi.mock('../../store/userStore', () => ({
  useUserStore: () => ({ people: [] }),
}));

describe('RegistrationWorkflow Function Initialization', () => {
  let mockConsoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.clearAllMocks();
  });

  afterEach(() => {
    mockConsoleError.mockRestore();
  });

  it('should not throw temporal dead zone errors during component initialization', { timeout: 20000 }, async () => {
    // This test specifically checks for the "Cannot access 'isStepCompleted' before initialization" error
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    // Import the component dynamically to test initialization
    const { RegistrationWorkflow } =
      await import('../../components/shows/RegistrationWorkflow/RegistrationWorkflow');

    // This should not throw any errors
    expect(() => {
      render(
        <QueryClientProvider client={queryClient}>
          <RegistrationWorkflow showId="test-show" onComplete={vi.fn()} onCancel={vi.fn()} />
        </QueryClientProvider>
      );
    }).not.toThrow();

    // Should not have logged any TDZ-related console errors
    const tdzErrors = mockConsoleError.mock.calls.filter(
      (args) => String(args[0]).includes('before initialization') || String(args[0]).includes('temporal dead zone')
    );
    expect(tdzErrors).toHaveLength(0);
  });

  it('should define all required functions before usage', async () => {
    // Test that functions are properly hoisted and accessible
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    const { RegistrationWorkflow } =
      await import('../../components/shows/RegistrationWorkflow/RegistrationWorkflow');

    // Mock React.createElement to capture function calls during render
    const originalCreateElement = React.createElement;
    const createElementSpy = vi.fn(originalCreateElement);
    React.createElement = createElementSpy;

    try {
      render(
        <QueryClientProvider client={queryClient}>
          <RegistrationWorkflow showId="test-show" onComplete={vi.fn()} onCancel={vi.fn()} />
        </QueryClientProvider>
      );

      // Component should render without throwing reference errors
      expect(createElementSpy).toHaveBeenCalled();
      expect(mockConsoleError).not.toHaveBeenCalled();
    } finally {
      React.createElement = originalCreateElement;
    }
  });

  it('should handle step completion calculation without errors', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    const { RegistrationWorkflow } =
      await import('../../components/shows/RegistrationWorkflow/RegistrationWorkflow');

    // This would fail if isStepCompleted is called before definition
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <RegistrationWorkflow showId="test-show" onComplete={vi.fn()} onCancel={vi.fn()} />
      </QueryClientProvider>
    );

    // Component should render successfully
    expect(container.firstChild).toBeTruthy();
    expect(mockConsoleError).not.toHaveBeenCalled();
  });
});

describe('RegistrationWorkflow Variable Declaration Order', () => {
  it('should declare isStepCompleted helper function', () => {
    // This test checks the source code structure to ensure proper function declaration
    const filePath = path.join(
      __dirname,
      '../../components/shows/RegistrationWorkflow/RegistrationWorkflow.tsx'
    );
    const fileContent = fs.readFileSync(filePath, 'utf8');

    // Find the position of isStepCompleted declaration
    const isStepCompletedPos = fileContent.indexOf('const isStepCompleted');

    // isStepCompleted should be defined in the component
    expect(isStepCompletedPos).toBeGreaterThan(0);
  });

  it('should not use functions in their declaration scope before definition', () => {
    // This is a static analysis test to prevent temporal dead zone issues
    const filePath = path.join(
      __dirname,
      '../../components/shows/RegistrationWorkflow/RegistrationWorkflow.tsx'
    );
    const fileContent = fs.readFileSync(filePath, 'utf8');

    // Extract the function body
    const functionStart = fileContent.indexOf('export function RegistrationWorkflow');
    const functionBody = fileContent.substring(functionStart);

    // Check that isStepCompleted is not used before its definition
    const lines = functionBody.split('\n');
    let isStepCompletedDefined = false;

    for (const line of lines) {
      if (line.includes('const isStepCompleted')) {
        isStepCompletedDefined = true;
      } else if (line.includes('isStepCompleted(') && !isStepCompletedDefined) {
        // Found usage before definition - this would cause temporal dead zone error
        throw new Error(`isStepCompleted used before definition on line: ${line.trim()}`);
      }
    }

    expect(isStepCompletedDefined).toBe(true);
  });
});
