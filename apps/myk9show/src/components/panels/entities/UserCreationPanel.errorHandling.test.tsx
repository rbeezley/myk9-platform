import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@/test/utils/testUtils';
import { render } from '@/test/utils/testUtils';
import { UserCreationPanel } from './UserCreationPanel';

const mockAddUser = vi.hoisted(() => vi.fn());
const mockErrorNotification = vi.hoisted(() => vi.fn());
const mockSuccessNotification = vi.hoisted(() => vi.fn());

vi.mock('@/store/userStore', () => ({
  useUserStore: () => ({
    addUser: mockAddUser,
    people: [],
  }),
}));

vi.mock('@/lib/notifications', () => ({
  notifications: {
    error: mockErrorNotification,
    success: mockSuccessNotification,
  },
}));

vi.mock('@/components/ui/select', () => ({
  Select: ({
    children,
    onValueChange,
    value,
  }: {
    children: React.ReactNode;
    onValueChange?: (value: string) => void;
    value?: string;
  }) => (
    <select
      aria-label="State"
      value={value ?? ''}
      onChange={event => onValueChange?.(event.target.value)}
    >
      {children}
    </select>
  ),
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => (
    <option value={value}>{children}</option>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => (
    <option value="" disabled>
      {placeholder}
    </option>
  ),
}));

vi.mock('@/services/LoggingService', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('UserCreationPanel error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the database duplicate-person message when person creation fails', async () => {
    const duplicateMessage = 'A person with this email already exists.';
    mockAddUser.mockRejectedValueOnce(new Error(duplicateMessage));

    render(
      <UserCreationPanel
        panelId="person-error-test"
        context={{ entityType: 'person', mode: 'create', preFilledData: { role: 'exhibitor' } }}
        onResult={vi.fn()}
        onClose={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText('First Name *'), { target: { value: 'Casey' } });
    fireEvent.change(screen.getByLabelText('Last Name *'), { target: { value: 'Morgan' } });
    fireEvent.change(screen.getByLabelText('Email *'), {
      target: { value: 'casey@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Phone *'), { target: { value: '555-123-4567' } });
    fireEvent.change(screen.getByLabelText('Address *'), {
      target: { value: '123 Trial Road' },
    });
    fireEvent.change(screen.getByLabelText('City *'), { target: { value: 'Topeka' } });
    fireEvent.change(screen.getByLabelText('State'), { target: { value: 'KS' } });
    fireEvent.change(screen.getByLabelText('ZIP Code *'), { target: { value: '66601' } });

    fireEvent.click(screen.getByRole('button', { name: 'Create User' }));

    await waitFor(() => {
      expect(mockErrorNotification).toHaveBeenCalledWith(duplicateMessage);
    });
    expect(await screen.findByText(duplicateMessage)).toBeInTheDocument();
  });
});
