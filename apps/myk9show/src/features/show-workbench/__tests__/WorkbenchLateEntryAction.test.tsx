import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { WorkbenchLateEntryAction } from '../WorkbenchLateEntryAction';

const getClassesWithCapacityMock = vi.hoisted(() => vi.fn());
const mockUseAuth = vi.hoisted(() => vi.fn());
const navigateMock = vi.hoisted(() => vi.fn());

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@/services/database/day-of-operations', () => ({
  getClassesWithCapacity: getClassesWithCapacityMock,
}));

type CapacityClass = {
  id: string;
  name: string;
  class_number: string;
  max_entries: number;
  accepted_count: number;
  available_spots: number;
};

function makeCapacityClass(overrides: Partial<CapacityClass> = {}): CapacityClass {
  return {
    id: 'class-1',
    name: 'Container Novice A',
    class_number: '101',
    max_entries: 25,
    accepted_count: 10,
    available_spots: 15,
    ...overrides,
  };
}

describe('WorkbenchLateEntryAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: { id: 'user-1' } });
    getClassesWithCapacityMock.mockResolvedValue({
      data: [makeCapacityClass()],
      error: null,
    });
  });

  it('routes to secretary registration in late-entry mode', async () => {
    const { user } = render(<WorkbenchLateEntryAction showId="show-1" />);

    expect(await screen.findByText('1 class with space')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add late entry' }));

    expect(navigateMock).toHaveBeenCalledWith(
      '/secretary/register/show-1?source=show-desk&entryMode=late'
    );
  });

  it('encodes the show id in the late-entry route', async () => {
    const { user } = render(<WorkbenchLateEntryAction showId="show 1/late" />);

    expect(await screen.findByText('1 class with space')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add late entry' }));

    expect(navigateMock).toHaveBeenCalledWith(
      '/secretary/register/show%201%2Flate?source=show-desk&entryMode=late'
    );
  });

  it('disables the action when no class has space', async () => {
    getClassesWithCapacityMock.mockResolvedValueOnce({
      data: [makeCapacityClass({ accepted_count: 25, available_spots: 0 })],
      error: null,
    });

    render(<WorkbenchLateEntryAction showId="show-1" />);

    expect(await screen.findByText('No classes with space')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add late entry' })).toBeDisabled();
  });

  it('disables the action when class availability cannot load', async () => {
    getClassesWithCapacityMock.mockRejectedValueOnce(new Error('capacity unavailable'));

    render(<WorkbenchLateEntryAction showId="show-1" />);

    expect(await screen.findByText('Class availability is unavailable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add late entry' })).toBeDisabled();
  });
});
