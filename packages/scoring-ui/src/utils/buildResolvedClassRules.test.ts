import { describe, it, expect } from 'vitest';
import { buildResolvedClassRules, maxTimeForArea } from './buildResolvedClassRules';

describe('buildResolvedClassRules', () => {
  it('builds from a complete camelCase class record', () => {
    const rules = buildResolvedClassRules({
      areaCount: 3,
      timeLimitSeconds: 210,
      timerMode: 'dual',
      hideCount: 4,
      hidesKnown: false,
      distractionCount: 2,
    });

    expect(rules).toEqual({
      areaCount: 3,
      maxTimeSeconds: 210,
      areaMaxTimeSeconds: [210, 210, 210],
      timerMode: 'dual',
      hideCount: 4,
      hidesKnown: false,
      distractionCount: 2,
    });
  });

  it('builds from a complete snake_case class record', () => {
    const rules = buildResolvedClassRules({
      area_count: 2,
      time_limit_seconds: 150,
      timer_mode: 'single',
      hide_count: 3,
      hides_known: true,
      distraction_count: 1,
    });

    expect(rules).toEqual({
      areaCount: 2,
      maxTimeSeconds: 150,
      areaMaxTimeSeconds: [150, 150],
      timerMode: 'single',
      hideCount: 3,
      hidesKnown: true,
      distractionCount: 1,
    });
  });

  it('provides safe defaults for missing fields (old classes)', () => {
    const rules = buildResolvedClassRules({});

    // No saved max time means NO limit, never an invented 3:00 (owner decision,
    // 2026-10-10): a judge-set AKC class without a time must not auto-stop at 3:00.
    expect(rules).toEqual({
      areaCount: 1,
      maxTimeSeconds: 0,
      areaMaxTimeSeconds: [0],
      timerMode: 'single',
      hideCount: null,
      hidesKnown: true,
      distractionCount: 0,
    });
  });

  it('prefers camelCase over snake_case when both present', () => {
    const rules = buildResolvedClassRules({
      areaCount: 3,
      area_count: 1,
      timerMode: 'dual',
      timer_mode: 'single',
    });

    expect(rules.areaCount).toBe(3);
    expect(rules.timerMode).toBe('dual');
  });

  it('falls back to snake_case when camelCase is null', () => {
    const rules = buildResolvedClassRules({
      areaCount: null,
      area_count: 2,
      timeLimitSeconds: null,
      time_limit_seconds: 240,
    });

    expect(rules.areaCount).toBe(2);
    expect(rules.maxTimeSeconds).toBe(240);
  });

  it('normalizes unknown timerMode values to single', () => {
    const rules = buildResolvedClassRules({ timerMode: 'unknown' });
    expect(rules.timerMode).toBe('single');
  });

  // AKC Scent Work: Container Novice — single area, single timer, 2 min
  it('handles AKC Container Novice class record', () => {
    const rules = buildResolvedClassRules({
      areaCount: 1,
      timeLimitSeconds: 120,
      timerMode: 'single',
      hideCount: 1,
      hidesKnown: true,
      distractionCount: 0,
    });

    expect(rules.areaCount).toBe(1);
    expect(rules.maxTimeSeconds).toBe(120);
    expect(rules.timerMode).toBe('single');
    expect(rules.hideCount).toBe(1);
    expect(rules.distractionCount).toBe(0);
  });

  // UKC Nosework: Container Superior — single area, dual timer
  it('handles UKC Container Superior class record (dual timer)', () => {
    const rules = buildResolvedClassRules({
      areaCount: 1,
      timeLimitSeconds: 180,
      timerMode: 'dual',
      hideCount: 3,
      hidesKnown: false,
      distractionCount: 0,
    });

    expect(rules.timerMode).toBe('dual');
    expect(rules.hideCount).toBe(3);
    expect(rules.hidesKnown).toBe(false);
  });

  // ASCA Scent Detection: Interior Excellent — 3 areas
  it('handles ASCA Interior Excellent class record (3 areas)', () => {
    const rules = buildResolvedClassRules({
      areaCount: 3,
      timeLimitSeconds: 210,
      timerMode: 'single',
      hideCount: 3,
      hidesKnown: true,
      distractionCount: 0,
    });

    expect(rules.areaCount).toBe(3);
    expect(rules.timerMode).toBe('single');
  });

  // Multi-sport: same builder, different inputs, different outputs
  it('produces different rules for AKC vs UKC from different class records', () => {
    const akcRules = buildResolvedClassRules({
      areaCount: 1,
      timeLimitSeconds: 150,
      timerMode: 'single',
      hideCount: 2,
      hidesKnown: true,
      distractionCount: 1,
    });

    const ukcRules = buildResolvedClassRules({
      areaCount: 1,
      timeLimitSeconds: 180,
      timerMode: 'dual',
      hideCount: 3,
      hidesKnown: false,
      distractionCount: 0,
    });

    expect(akcRules.timerMode).toBe('single');
    expect(ukcRules.timerMode).toBe('dual');
    expect(akcRules.maxTimeSeconds).not.toBe(ukcRules.maxTimeSeconds);
    expect(akcRules.hideCount).not.toBe(ukcRules.hideCount);
  });

  // MYK9-1098: a multi-area class carries one max time per area.
  it('gives each area its own max time, falling back to area 1', () => {
    const camel = buildResolvedClassRules({
      areaCount: 3,
      timeLimitSeconds: 90,
      timeLimitArea2Seconds: 120,
      timeLimitArea3Seconds: 150,
    });
    expect(camel.areaMaxTimeSeconds).toEqual([90, 120, 150]);
    expect(maxTimeForArea(camel, 2)).toBe(150);

    const snake = buildResolvedClassRules({
      area_count: 3,
      time_limit_seconds: 60,
      time_limit_area2_seconds: 180,
    });
    expect(snake.areaMaxTimeSeconds).toEqual([60, 180, 60]);
  });

  it('maxTimeForArea falls back to maxTimeSeconds for rules without per-area times', () => {
    const rules = buildResolvedClassRules({ areaCount: 2, timeLimitSeconds: 120 });
    expect(maxTimeForArea({ ...rules, areaMaxTimeSeconds: undefined }, 1)).toBe(120);
  });
});
