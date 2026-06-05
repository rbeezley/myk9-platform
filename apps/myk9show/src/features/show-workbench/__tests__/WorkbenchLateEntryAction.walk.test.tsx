import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import {
  createDayOfEntry,
  createDayOfEntryDog,
  getClassesWithCapacity,
} from '@/services/database/day-of-operations';
import { WorkbenchLateEntryAction } from '../WorkbenchLateEntryAction';

const navigateMock = vi.hoisted(() => vi.fn());

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'secretary-auth-1' } }),
}));

vi.mock('@/services/database/day-of-operations', () => ({
  createDayOfEntry: vi.fn(),
  createDayOfEntryDog: vi.fn(),
  getClassesWithCapacity: vi.fn(),
}));

const createDayOfEntryMock = vi.mocked(createDayOfEntry);
const createDayOfEntryDogMock = vi.mocked(createDayOfEntryDog);
const getClassesWithCapacityMock = vi.mocked(getClassesWithCapacity);

type CapacityClass = {
  id: string;
  name: string;
  class_number: string;
  max_entries: number;
  trial_id: string;
  accepted_count: number;
  available_spots: number;
};

function makeCapacityClass(overrides: Partial<CapacityClass> = {}): CapacityClass {
  return {
    id: 'class-1',
    name: 'Container Novice A',
    class_number: '101',
    max_entries: 25,
    trial_id: 'trial-1',
    accepted_count: 10,
    available_spots: 15,
    ...overrides,
  };
}

describe('WorkbenchLateEntryAction late-entry walk', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getClassesWithCapacityMock.mockResolvedValue({
      data: [makeCapacityClass()],
      error: null,
    });
  });

  it('delegates late-entry creation to registration without calling the day-of write path', async () => {
    const { user } = render(<WorkbenchLateEntryAction showId="show-1" />);

    await user.click(await screen.findByRole('button', { name: 'Add late entry' }));

    expect(navigateMock).toHaveBeenCalledWith(
      '/secretary/register/show-1?source=show-desk&entryMode=late'
    );
    expect(createDayOfEntryDogMock).not.toHaveBeenCalled();
    expect(createDayOfEntryMock).not.toHaveBeenCalled();
  });
});
