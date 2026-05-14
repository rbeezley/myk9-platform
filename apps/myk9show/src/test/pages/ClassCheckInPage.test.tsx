import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/test/utils/testUtils';
import ClassCheckInPage from '@/pages/ClassCheckInPage';
import type { ExhibitorClassInfo } from '@/types/exhibitor-types';

const mockClassInfo: ExhibitorClassInfo = {
  class: {
    id: 'class-1',
    showId: 'show-1',
    trialId: 'trial-1',
    name: 'Container Novice A',
    element: 'Container',
    level: 'Novice',
    maxEntries: 30,
    judgeName: 'Ellen Heavner',
    startTime: new Date(Date.now() + 90 * 60000).toISOString(),
    ringNumber: 1,
  },
  trial: {
    id: 'trial-1',
    showId: 'show-1',
    name: 'Scent Work Day 1',
    date: new Date().toISOString().split('T')[0],
    startTime: '08:00',
    endTime: '17:00',
    location: 'Main Hall',
    organization: 'AKC',
  },
  entry: {
    id: 'entry-1',
    classId: 'class-1',
    dogId: 'dog-1',
    handlerId: 'handler-1',
    armband: '42',
    checkInStatus: 'no-status',
    dogCallName: 'Storm',
    dogRegistrationNumber: '',
    breed: 'Border Collie',
    handlerName: 'Jane Smith',
    className: 'Container Novice A',
    ringNumber: 1,
    judgeName: 'Ellen Heavner',
    dog: {
      id: 'dog-1',
      name: 'Storm',
      breed: 'Border Collie',
      sex: 'male',
      callName: 'Storm',
      ownerId: 'handler-1',
      registrations: [],
    },
  },
  ringStatus: {
    classId: 'class-1',
    className: 'Container Novice A',
    ringNumber: 1,
    judgeName: 'Ellen Heavner',
    judgeStatus: 'active',
    totalEntries: 0,
    completedEntries: 0,
    onDeck: [],
    lastUpdated: new Date(),
  },
};

const mockMutateAsync = vi.fn().mockResolvedValue(undefined);
vi.mock('@/hooks/mutations/useCheckInMutation', () => ({
  useCheckInMutation: () => ({ mutateAsync: mockMutateAsync }),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    userWithRoles: { databaseUserId: 'user-123' },
  }),
}));

const mockUseClassCheckInData = vi.fn();
vi.mock('@/hooks/queries/useClassCheckInData', () => ({
  useClassCheckInData: (entryId: string) => mockUseClassCheckInData(entryId),
}));

function renderPage(entryId = 'entry-1') {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MemoryRouter initialEntries={[`/exhibitor/check-in/${entryId}`]}>
        <Routes>
          <Route path="/exhibitor/check-in/:entryId" element={<ClassCheckInPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('ClassCheckInPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows spinner while loading', () => {
    mockUseClassCheckInData.mockReturnValue({ isLoading: true, data: undefined, error: null });
    renderPage();
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('shows error card on fetch failure', () => {
    mockUseClassCheckInData.mockReturnValue({
      isLoading: false,
      data: undefined,
      error: new Error('DB error'),
    });
    renderPage();
    expect(screen.getByText(/Unable to load/i)).toBeInTheDocument();
  });

  it('shows 404 card when entry not found', () => {
    mockUseClassCheckInData.mockReturnValue({ isLoading: false, data: null, error: null });
    renderPage();
    expect(screen.getByText(/Entry not found/i)).toBeInTheDocument();
  });

  it('renders ClassCheckIn when data loads', () => {
    mockUseClassCheckInData.mockReturnValue({
      isLoading: false,
      data: mockClassInfo,
      error: null,
    });
    renderPage();
    expect(screen.getAllByText('Container Novice A').length).toBeGreaterThan(0);
  });

  it('calls mutation with checked-in when user selects Present', async () => {
    mockUseClassCheckInData.mockReturnValue({
      isLoading: false,
      data: mockClassInfo,
      error: null,
    });
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /present/i }));
    await userEvent.click(screen.getByRole('button', { name: /confirm check.in/i }));
    await waitFor(() =>
      expect(mockMutateAsync).toHaveBeenCalledWith({
        entryId: 'entry-1',
        newStatus: 'checked-in',
      })
    );
  });

  it('calls mutation with pulled when user selects Pull', async () => {
    mockUseClassCheckInData.mockReturnValue({
      isLoading: false,
      data: mockClassInfo,
      error: null,
    });
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /^pull$/i }));
    await userEvent.click(screen.getByRole('button', { name: /confirm pull/i }));
    await userEvent.click(screen.getByRole('button', { name: /confirm check.in/i }));
    await waitFor(() =>
      expect(mockMutateAsync).toHaveBeenCalledWith({
        entryId: 'entry-1',
        newStatus: 'pulled',
      })
    );
  });

  it('navigates to /exhibitor/show-day after successful check-in', async () => {
    mockUseClassCheckInData.mockReturnValue({
      isLoading: false,
      data: mockClassInfo,
      error: null,
    });
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /present/i }));
    await userEvent.click(screen.getByRole('button', { name: /confirm check.in/i }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/exhibitor/show-day'), {
      timeout: 3000,
    });
  });
});
