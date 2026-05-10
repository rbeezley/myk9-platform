import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getVisibilitySettings,
  updateClassVisibility,
  updateShowVisibility,
  updateTrialVisibility,
} from './index';

const mockFrom = vi.fn();

vi.mock('../supabaseClient', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

function chain(overrides: Record<string, unknown> = {}) {
  const query: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    ...overrides,
  };

  return query;
}

describe('visibility database module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-10T12:00:00.000Z'));
  });

  it('fetches show defaults, trial overrides, and class overrides for a show', async () => {
    const showDefaults = {
      show_id: 'show-1',
      preset: 'open',
      placement_timing: 'class_complete',
      qualification_timing: 'immediate',
      time_timing: 'immediate',
      faults_timing: 'immediate',
      self_checkin_enabled: true,
      updated_at: '2026-05-10T11:00:00.000Z',
      updated_by: null,
    };
    const trialOverride = {
      trial_id: 'trial-1',
      preset: 'standard',
      placement_timing: null,
      qualification_timing: null,
      time_timing: null,
      faults_timing: null,
      self_checkin_enabled: null,
      updated_at: null,
      updated_by: null,
    };
    const classOverride = {
      class_id: 'class-1',
      preset: null,
      placement_timing: 'class_complete',
      qualification_timing: null,
      time_timing: null,
      faults_timing: null,
      self_checkin_enabled: false,
      updated_at: null,
      updated_by: null,
    };

    const showQuery = chain({ maybeSingle: vi.fn().mockResolvedValue({ data: showDefaults, error: null }) });
    const trialsQuery = chain({ eq: vi.fn().mockResolvedValue({ data: [{ id: 'trial-1' }], error: null }) });
    const trialOverridesQuery = chain({ in: vi.fn().mockResolvedValue({ data: [trialOverride], error: null }) });
    const classOverridesQuery = chain({ in: vi.fn().mockResolvedValue({ data: [classOverride], error: null }) });

    mockFrom
      .mockReturnValueOnce(showQuery)
      .mockReturnValueOnce(trialsQuery)
      .mockReturnValueOnce(trialOverridesQuery)
      .mockReturnValueOnce(classOverridesQuery);

    const result = await getVisibilitySettings('show-1');

    expect(result).toEqual({
      showDefaults,
      trialOverrides: [trialOverride],
      classOverrides: [classOverride],
    });
    expect(mockFrom).toHaveBeenNthCalledWith(1, 'show_visibility_settings');
    expect(mockFrom).toHaveBeenNthCalledWith(2, 'trials');
    expect(trialOverridesQuery.in).toHaveBeenCalledWith('trial_id', ['trial-1']);
    expect(classOverridesQuery.in).toHaveBeenCalledWith('classes.trial_id', ['trial-1']);
  });

  it('upserts show visibility with preset timings and audit fields', async () => {
    const query = chain({ upsert: vi.fn().mockResolvedValue({ error: null }) });
    mockFrom.mockReturnValue(query);

    await updateShowVisibility(
      { showId: 'show-1', presetName: 'open', selfCheckinEnabled: false },
      'user-1'
    );

    expect(mockFrom).toHaveBeenCalledWith('show_visibility_settings');
    expect(query.upsert).toHaveBeenCalledWith({
      show_id: 'show-1',
      preset: 'open',
      placement_timing: 'class_complete',
      qualification_timing: 'immediate',
      time_timing: 'immediate',
      faults_timing: 'immediate',
      self_checkin_enabled: false,
      updated_at: '2026-05-10T12:00:00.000Z',
      updated_by: 'user-1',
    });
  });

  it('inserts a trial override when update finds no existing row', async () => {
    const updateQuery = chain({
      select: vi.fn().mockResolvedValue({ data: [], error: null }),
    });
    const insertQuery = chain({
      insert: vi.fn().mockResolvedValue({ error: null }),
    });
    mockFrom.mockReturnValueOnce(updateQuery).mockReturnValueOnce(insertQuery);

    await updateTrialVisibility({ trialId: 'trial-1', presetName: 'standard' }, 'user-1');

    expect(updateQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        preset: 'standard',
        updated_by: 'user-1',
      })
    );
    expect(insertQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        trial_id: 'trial-1',
        preset: 'standard',
      })
    );
  });

  it('deletes class visibility overrides when reset is requested', async () => {
    const query = chain({ in: vi.fn().mockResolvedValue({ error: null }) });
    mockFrom.mockReturnValue(query);

    await updateClassVisibility({ classIds: ['class-1', 'class-2'], reset: true }, 'user-1');

    expect(mockFrom).toHaveBeenCalledWith('class_visibility_overrides');
    expect(query.delete).toHaveBeenCalled();
    expect(query.in).toHaveBeenCalledWith('class_id', ['class-1', 'class-2']);
  });
});
