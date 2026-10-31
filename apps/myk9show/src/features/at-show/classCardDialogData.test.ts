import { describe, expect, it } from 'vitest';
import type { ClassEntry } from '@myk9/ringside';
import type { ReplicatedClass } from '@/services/replication/ReplicatedClassesTable';
import { classDetailsData, classMaxTimeData } from './classCardDialogData';

const entry = {
  id: 'class-1',
  element: 'Interior',
  level: 'Excellent',
  section: '',
  class_name: 'Interior Excellent',
  class_order: 1,
  judge_name: 'Jane Judge',
  entry_count: 8,
  completed_count: 3,
  class_status: 'in_progress',
  is_favorite: false,
  dogs: [],
} as ClassEntry;

const live = {
  id: 'class-1',
  timeLimitSeconds: 180,
  timeLimitArea2Seconds: 240,
  timeLimitArea3Seconds: null,
  areaCount: 2,
} as unknown as ReplicatedClass;

describe('classMaxTimeData', () => {
  it('takes the saved times and area count from the live class, which the card lacks', () => {
    expect(classMaxTimeData(entry, live)).toMatchObject({
      id: 'class-1',
      time_limit_seconds: 180,
      time_limit_area2_seconds: 240,
      area_count: 2,
    });
    expect(classMaxTimeData(entry, live)).not.toHaveProperty('time_limit_area3_seconds');
  });

  it('is blank, not invented, before the live class has loaded', () => {
    const data = classMaxTimeData(entry, null);
    expect(data).not.toHaveProperty('time_limit_seconds');
    expect(data).not.toHaveProperty('area_count');
  });
});

describe('classDetailsData', () => {
  it('shows the entry counts when the card trusts them', () => {
    expect(classDetailsData(entry, live, 'America/New_York', true)).toMatchObject({
      totalEntries: 8,
      completedEntries: 3,
    });
  });

  it('leaves the aggregate out when the counts are unread or partial', () => {
    const data = classDetailsData(entry, live, 'America/New_York', false);
    expect(data).not.toHaveProperty('totalEntries');
    expect(data).not.toHaveProperty('completedEntries');
    expect(data.judgeName).toBe('Jane Judge');
  });
});
