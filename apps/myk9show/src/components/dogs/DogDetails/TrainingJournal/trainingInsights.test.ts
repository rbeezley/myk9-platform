import { describe, expect, it } from 'vitest';
import { buildTrainingProgressReport } from './trainingInsights';

describe('buildTrainingProgressReport', () => {
  it('builds skill, assessment, and time trend metrics', () => {
    const report = buildTrainingProgressReport([
      {
        date: new Date('2026-05-01T12:00:00Z'),
        duration: 30,
        skills: ['Containers'],
        progress: 'excellent',
      },
      {
        date: new Date('2026-05-05T12:00:00Z'),
        duration: 45,
        skills: ['Containers', 'Interiors'],
        progress: 'good',
      },
    ]);

    expect(report.totalSessions).toBe(2);
    expect(report.totalMinutes).toBe(75);
    expect(report.bySkill).toEqual([
      { skill: 'Containers', sessions: 2, minutes: 75 },
      { skill: 'Interiors', sessions: 1, minutes: 45 },
    ]);
    expect(report.progressCounts).toEqual({
      excellent: 1,
      good: 1,
      fair: 0,
      needs_work: 0,
    });
    expect(report.monthlyMinutes).toEqual([{ month: 'May 2026', minutes: 75, sessions: 2 }]);
  });
});
