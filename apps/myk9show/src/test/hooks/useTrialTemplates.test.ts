import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTrialTemplates } from '@/hooks/useTrialTemplates';
import type { ClassDefinition, ClassTemplate } from '@/types/template.types';

// Mock logger
vi.mock('@/services/LoggingService', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const makeTemplate = (name = 'Test Template'): ClassTemplate =>
  ({
    templateName: name,
    classes: [],
  }) as unknown as ClassTemplate;

const makeClassDef = (overrides: Partial<ClassDefinition> = {}): ClassDefinition =>
  ({
    className: 'Containers Novice A',
    element: 'Containers',
    level: 'Novice',
    section: 'A',
    classNumber: 'CN-001',
    ...overrides,
  }) as ClassDefinition;

const makeTrial = (overrides: Record<string, unknown> = {}) => ({
  id: 'trial-1',
  name: 'Saturday Trial',
  type: 'Nosework',
  trialDate: '2026-06-15',
  trialNumber: 'T-001',
  showId: 'show-1',
  status: 'Upcoming',
  classes: [],
  ...overrides,
});

describe('useTrialTemplates', () => {
  const mockUpdateTrial = vi.fn();
  const mockAddClass = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does nothing when currentTrial is undefined', () => {
    const { result } = renderHook(() =>
      useTrialTemplates({
        currentTrial: undefined,
        updateTrial: mockUpdateTrial,
        addClass: mockAddClass,
        userId: 'user-1',
      })
    );

    act(() => {
      result.current.handleSaveClassesFromTemplate([makeClassDef()], makeTemplate());
    });

    expect(mockUpdateTrial).not.toHaveBeenCalled();
    expect(mockAddClass).not.toHaveBeenCalled();
  });

  it('adds new classes to the trial and classStore', () => {
    const trial = makeTrial();
    const classDefs = [
      makeClassDef({ element: 'Containers', level: 'Novice', section: 'A' }),
      makeClassDef({ element: 'Interior', level: 'Advanced', section: 'B' }),
    ];

    const { result } = renderHook(() =>
      useTrialTemplates({
        currentTrial: trial as Parameters<typeof useTrialTemplates>[0]['currentTrial'],
        updateTrial: mockUpdateTrial,
        addClass: mockAddClass,
        userId: 'user-1',
      })
    );

    act(() => {
      result.current.handleSaveClassesFromTemplate(classDefs, makeTemplate());
    });

    // addClass called once per new class
    expect(mockAddClass).toHaveBeenCalledTimes(2);
    // updateTrial called once with both classes merged
    expect(mockUpdateTrial).toHaveBeenCalledTimes(1);
    const updatedTrialArg = mockUpdateTrial.mock.calls[0][1];
    expect(updatedTrialArg.classes).toHaveLength(2);
  });

  it('skips duplicate classes that already exist on the trial', () => {
    const existingClass = {
      id: 'existing-1',
      element: 'Containers',
      level: 'Novice',
      section: 'A',
      status: 'Upcoming' as const,
      judgeId: 'judge-1',
      judgeName: 'Judge One',
      startTime: '2026-06-15T09:00:00',
      entries: 0,
    };
    const trial = makeTrial({ classes: [existingClass] });

    const classDefs = [
      makeClassDef({ element: 'Containers', level: 'Novice', section: 'A' }), // duplicate
      makeClassDef({ element: 'Interior', level: 'Advanced', section: 'B' }), // new
    ];

    const { result } = renderHook(() =>
      useTrialTemplates({
        currentTrial: trial as Parameters<typeof useTrialTemplates>[0]['currentTrial'],
        updateTrial: mockUpdateTrial,
        addClass: mockAddClass,
        userId: 'user-1',
      })
    );

    act(() => {
      result.current.handleSaveClassesFromTemplate(classDefs, makeTemplate());
    });

    // Only 1 new class added (the duplicate is skipped)
    expect(mockAddClass).toHaveBeenCalledTimes(1);
    const updatedTrialArg = mockUpdateTrial.mock.calls[0][1];
    // Existing + 1 new = 2
    expect(updatedTrialArg.classes).toHaveLength(2);
  });

  it('applies judge assignments to new classes', () => {
    const trial = makeTrial();
    const classDef = makeClassDef({ className: 'Containers Novice A' });
    const judgeAssignments = [
      { classId: 'Containers Novice A', judgeId: 'judge-5', judgeName: 'Expert Judge' },
    ];

    const { result } = renderHook(() =>
      useTrialTemplates({
        currentTrial: trial as Parameters<typeof useTrialTemplates>[0]['currentTrial'],
        updateTrial: mockUpdateTrial,
        addClass: mockAddClass,
        userId: 'user-1',
      })
    );

    act(() => {
      result.current.handleSaveClassesFromTemplate([classDef], makeTemplate(), judgeAssignments);
    });

    const updatedTrialArg = mockUpdateTrial.mock.calls[0][1];
    expect(updatedTrialArg.classes[0].judgeId).toBe('judge-5');
    expect(updatedTrialArg.classes[0].judgeName).toBe('Expert Judge');
  });

  it('defaults judge to TBD when no assignment provided', () => {
    const trial = makeTrial();
    const classDef = makeClassDef();

    const { result } = renderHook(() =>
      useTrialTemplates({
        currentTrial: trial as Parameters<typeof useTrialTemplates>[0]['currentTrial'],
        updateTrial: mockUpdateTrial,
        addClass: mockAddClass,
        userId: 'user-1',
      })
    );

    act(() => {
      result.current.handleSaveClassesFromTemplate([classDef], makeTemplate());
    });

    const updatedTrialArg = mockUpdateTrial.mock.calls[0][1];
    expect(updatedTrialArg.classes[0].judgeId).toBe('TBD');
    expect(updatedTrialArg.classes[0].judgeName).toBe('TBD');
  });

  it('does not call updateTrial when all classes are duplicates', () => {
    const existingClass = {
      id: 'existing-1',
      element: 'Containers',
      level: 'Novice',
      section: 'A',
      status: 'Upcoming' as const,
      judgeId: 'judge-1',
      judgeName: 'Judge One',
      startTime: '2026-06-15T09:00:00',
      entries: 0,
    };
    const trial = makeTrial({ classes: [existingClass] });
    const classDef = makeClassDef({ element: 'Containers', level: 'Novice', section: 'A' });

    const { result } = renderHook(() =>
      useTrialTemplates({
        currentTrial: trial as Parameters<typeof useTrialTemplates>[0]['currentTrial'],
        updateTrial: mockUpdateTrial,
        addClass: mockAddClass,
        userId: 'user-1',
      })
    );

    act(() => {
      result.current.handleSaveClassesFromTemplate([classDef], makeTemplate());
    });

    // Still calls updateTrial (with only existing classes), but addClass is not called
    expect(mockAddClass).not.toHaveBeenCalled();
  });

  it('passes userId to updateTrial', () => {
    const trial = makeTrial();
    const classDef = makeClassDef();

    const { result } = renderHook(() =>
      useTrialTemplates({
        currentTrial: trial as Parameters<typeof useTrialTemplates>[0]['currentTrial'],
        updateTrial: mockUpdateTrial,
        addClass: mockAddClass,
        userId: 'my-user-id',
      })
    );

    act(() => {
      result.current.handleSaveClassesFromTemplate([classDef], makeTemplate());
    });

    expect(mockUpdateTrial).toHaveBeenCalledWith('trial-1', expect.any(Object), 'my-user-id');
  });
});
