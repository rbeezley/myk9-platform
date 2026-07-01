import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockLoadClubs = vi.fn().mockResolvedValue(undefined);
const mockLoadPeople = vi.fn().mockResolvedValue(undefined);
const mockUpdateShowData = vi.fn();

let mockPeople: Array<{ id: string; email?: string }> = [];

vi.mock('@/store/clubStore', () => ({
  useClubStore: vi.fn(() => ({ loadClubs: mockLoadClubs })),
}));

vi.mock('@/store/userStore', () => ({
  useUserStore: vi.fn(() => ({ people: mockPeople, loadPeople: mockLoadPeople })),
}));

vi.mock('@/store/wizardStore', () => ({
  useWizardStore: vi.fn(() => ({ updateShowData: mockUpdateShowData })),
}));

const mockCreateUser = vi.fn();
const mockUpdateUser = vi.fn();
vi.mock('@/services/database/users', () => ({
  createUser: (...args: unknown[]) => mockCreateUser(...args),
  updateUser: (...args: unknown[]) => mockUpdateUser(...args),
}));

const mockCreateJudgeQualification = vi.fn();
vi.mock('@/services/database/judges', () => ({
  createJudgeQualification: (...args: unknown[]) => mockCreateJudgeQualification(...args),
}));

const mockCreateClub = vi.fn();
vi.mock('@/services/database/clubs', () => ({
  createClub: (...args: unknown[]) => mockCreateClub(...args),
}));

vi.mock('@/services/LoggingService', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { useShowDetailsStepActions } from '../useShowDetailsStepActions';

describe('useShowDetailsStepActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPeople = [];
  });

  describe('handleCreateClub', () => {
    it('calls createClub with name and email, then loadClubs and updateShowData on success', async () => {
      mockCreateClub.mockResolvedValue({ data: { id: 'club-1' }, error: null });
      const { result } = renderHook(() => useShowDetailsStepActions());

      await result.current.handleCreateClub({ name: 'Test Club', email: 'club@example.com' });

      expect(mockCreateClub).toHaveBeenCalledWith({
        name: 'Test Club',
        email: 'club@example.com',
      });
      expect(mockLoadClubs).toHaveBeenCalled();
      expect(mockUpdateShowData).toHaveBeenCalledWith({ clubId: 'club-1' });
    });

    it('throws on result.error and does not call loadClubs/updateShowData', async () => {
      const error = new Error('insert failed');
      mockCreateClub.mockResolvedValue({ data: null, error });
      const { result } = renderHook(() => useShowDetailsStepActions());

      await expect(
        result.current.handleCreateClub({ name: 'Bad Club', email: 'bad@example.com' })
      ).rejects.toThrow('insert failed');

      expect(mockLoadClubs).not.toHaveBeenCalled();
      expect(mockUpdateShowData).not.toHaveBeenCalled();
    });
  });

  describe('handleCreateOfficialPerson', () => {
    it('calls createUser with phone, loadPeople, and returns the new id', async () => {
      mockCreateUser.mockResolvedValue({ data: { id: 'person-1' }, error: null });
      const { result } = renderHook(() => useShowDetailsStepActions());

      const id = await result.current.handleCreateOfficialPerson({
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
        phone: '555-111-2222',
      });

      expect(mockCreateUser).toHaveBeenCalledWith({
        first_name: 'Jane',
        last_name: 'Doe',
        email: 'jane@example.com',
        phone: '555-111-2222',
      });
      expect(mockLoadPeople).toHaveBeenCalled();
      expect(id).toBe('person-1');
    });

    it('reuses an existing person with the same email instead of creating a duplicate', async () => {
      mockPeople = [{ id: 'existing-1', email: 'Jane@Example.com' }];
      const { result } = renderHook(() => useShowDetailsStepActions());

      const id = await result.current.handleCreateOfficialPerson({
        firstName: 'Jane',
        lastName: 'Doe',
        // Different casing / whitespace still matches the existing record.
        email: '  jane@example.com  ',
        phone: '555-111-2222',
      });

      expect(id).toBe('existing-1');
      expect(mockCreateUser).not.toHaveBeenCalled();
      expect(mockLoadPeople).not.toHaveBeenCalled();
    });

    it('creates a new person when no email matches an existing record', async () => {
      mockPeople = [{ id: 'existing-1', email: 'someone-else@example.com' }];
      mockCreateUser.mockResolvedValue({ data: { id: 'person-2' }, error: null });
      const { result } = renderHook(() => useShowDetailsStepActions());

      const id = await result.current.handleCreateOfficialPerson({
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
        phone: '555-111-2222',
      });

      expect(id).toBe('person-2');
      expect(mockCreateUser).toHaveBeenCalled();
    });

    it('throws on result.error', async () => {
      const error = new Error('create failed');
      mockCreateUser.mockResolvedValue({ data: null, error });
      const { result } = renderHook(() => useShowDetailsStepActions());

      await expect(
        result.current.handleCreateOfficialPerson({
          firstName: 'Jane',
          lastName: 'Doe',
          email: 'jane@example.com',
          phone: '555-111-2222',
        })
      ).rejects.toThrow('create failed');
    });
  });

  describe('handleSaveJudgeCredentials', () => {
    it('throws "Judge number is required" when judgeNumber is blank/whitespace', async () => {
      const { result } = renderHook(() => useShowDetailsStepActions());

      await expect(
        result.current.handleSaveJudgeCredentials('person-1', {
          organization: 'AKC',
          judgeNumber: '   ',
          email: '',
        })
      ).rejects.toThrow('Judge number is required');

      expect(mockCreateJudgeQualification).not.toHaveBeenCalled();
    });

    it('calls createJudgeQualification with the right shape', async () => {
      mockPeople = [{ id: 'person-1', email: 'existing@example.com' }];
      mockCreateJudgeQualification.mockResolvedValue({ id: 'qual-1' });
      const { result } = renderHook(() => useShowDetailsStepActions());

      await result.current.handleSaveJudgeCredentials('person-1', {
        organization: 'AKC',
        judgeNumber: 'J123',
        email: '',
      });

      expect(mockCreateJudgeQualification).toHaveBeenCalledWith(
        expect.objectContaining({
          person_id: 'person-1',
          organization: 'AKC',
          qualification_level: 'General',
          disciplines: [],
          judge_number: 'J123',
          is_active: true,
        })
      );
      expect(mockLoadPeople).toHaveBeenCalled();
    });

    it('calls updateUser when the person has no existing email and one was provided', async () => {
      mockPeople = [{ id: 'person-1', email: undefined }];
      mockCreateJudgeQualification.mockResolvedValue({ id: 'qual-1' });
      const { result } = renderHook(() => useShowDetailsStepActions());

      await result.current.handleSaveJudgeCredentials('person-1', {
        organization: 'AKC',
        judgeNumber: 'J123',
        email: 'new@example.com',
      });

      expect(mockUpdateUser).toHaveBeenCalledWith('person-1', { email: 'new@example.com' });
      expect(mockLoadPeople).toHaveBeenCalled();
    });

    it('does not call updateUser when the person already has an email', async () => {
      mockPeople = [{ id: 'person-1', email: 'existing@example.com' }];
      mockCreateJudgeQualification.mockResolvedValue({ id: 'qual-1' });
      const { result } = renderHook(() => useShowDetailsStepActions());

      await result.current.handleSaveJudgeCredentials('person-1', {
        organization: 'AKC',
        judgeNumber: 'J123',
        email: 'new@example.com',
      });

      expect(mockUpdateUser).not.toHaveBeenCalled();
      expect(mockLoadPeople).toHaveBeenCalled();
    });

    it('does not call updateUser when no email was provided', async () => {
      mockPeople = [{ id: 'person-1', email: undefined }];
      mockCreateJudgeQualification.mockResolvedValue({ id: 'qual-1' });
      const { result } = renderHook(() => useShowDetailsStepActions());

      await result.current.handleSaveJudgeCredentials('person-1', {
        organization: 'AKC',
        judgeNumber: 'J123',
        email: '',
      });

      expect(mockUpdateUser).not.toHaveBeenCalled();
      expect(mockLoadPeople).toHaveBeenCalled();
    });

    it('always calls loadPeople(), even when the email branch is skipped', async () => {
      mockPeople = [];
      mockCreateJudgeQualification.mockResolvedValue({ id: 'qual-1' });
      const { result } = renderHook(() => useShowDetailsStepActions());

      await result.current.handleSaveJudgeCredentials('unknown-person', {
        organization: 'AKC',
        judgeNumber: 'J123',
        email: 'new@example.com',
      });

      expect(mockLoadPeople).toHaveBeenCalled();
    });

    it('reflects an updated people list across re-renders rather than a stale closure', async () => {
      mockPeople = [{ id: 'person-1', email: 'existing@example.com' }];
      mockCreateJudgeQualification.mockResolvedValue({ id: 'qual-1' });
      const { result, rerender } = renderHook(() => useShowDetailsStepActions());

      // person-1 already has an email — updateUser should NOT be called.
      await result.current.handleSaveJudgeCredentials('person-1', {
        organization: 'AKC',
        judgeNumber: 'J123',
        email: 'new@example.com',
      });
      expect(mockUpdateUser).not.toHaveBeenCalled();

      // Simulate the people list changing (e.g. person-1's email cleared) and
      // the hook re-rendering with the fresh store value.
      mockPeople = [{ id: 'person-1', email: undefined }];
      rerender();

      await result.current.handleSaveJudgeCredentials('person-1', {
        organization: 'AKC',
        judgeNumber: 'J123',
        email: 'fresh@example.com',
      });
      expect(mockUpdateUser).toHaveBeenCalledWith('person-1', { email: 'fresh@example.com' });
    });
  });

  describe('handleCreateNewJudge', () => {
    it('throws on blank judge number before calling createUser', async () => {
      const { result } = renderHook(() => useShowDetailsStepActions());

      await expect(
        result.current.handleCreateNewJudge({
          firstName: 'Jane',
          lastName: 'Doe',
          organization: 'AKC',
          judgeNumber: '  ',
          email: 'jane@example.com',
        })
      ).rejects.toThrow('Judge number is required');

      expect(mockCreateUser).not.toHaveBeenCalled();
    });

    it('calls createUser then createJudgeQualification, and returns the new person id', async () => {
      mockCreateUser.mockResolvedValue({ data: { id: 'person-2' }, error: null });
      mockCreateJudgeQualification.mockResolvedValue({ id: 'qual-2' });
      const { result } = renderHook(() => useShowDetailsStepActions());

      const id = await result.current.handleCreateNewJudge({
        firstName: 'Jane',
        lastName: 'Doe',
        organization: 'AKC',
        judgeNumber: 'J456',
        email: 'jane@example.com',
      });

      expect(mockCreateUser).toHaveBeenCalledWith({
        first_name: 'Jane',
        last_name: 'Doe',
        email: 'jane@example.com',
      });
      expect(mockCreateJudgeQualification).toHaveBeenCalledWith(
        expect.objectContaining({
          person_id: 'person-2',
          organization: 'AKC',
          judge_number: 'J456',
        })
      );
      expect(mockLoadPeople).toHaveBeenCalled();
      expect(id).toBe('person-2');
    });

    it('throws on createUser result.error', async () => {
      const error = new Error('create failed');
      mockCreateUser.mockResolvedValue({ data: null, error });
      const { result } = renderHook(() => useShowDetailsStepActions());

      await expect(
        result.current.handleCreateNewJudge({
          firstName: 'Jane',
          lastName: 'Doe',
          organization: 'AKC',
          judgeNumber: 'J456',
          email: 'jane@example.com',
        })
      ).rejects.toThrow('create failed');

      expect(mockCreateJudgeQualification).not.toHaveBeenCalled();
    });
  });
});
