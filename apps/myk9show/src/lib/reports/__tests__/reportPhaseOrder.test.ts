import { describe, it, expect } from 'vitest';
import {
  resolveShowTimePhase,
  orderReportPhases,
  DEFAULT_REPORT_PHASE_ORDER,
} from '../reportPhaseOrder';
import { reportRegistry } from '../reportRegistry';
import type { ReportPhase } from '../types';

const MARCH_22 = new Date(2026, 2, 22, 9, 0, 0);

describe('resolveShowTimePhase', () => {
  it('reads a show that has not started as before', () => {
    expect(resolveShowTimePhase({ startDate: '2026-03-25', endDate: '2026-03-26' }, MARCH_22)).toBe(
      'before'
    );
  });

  it('reads a running show as during, on the first day and the last', () => {
    // Both bounds inclusive: the first and last day of a show ARE show days.
    expect(resolveShowTimePhase({ startDate: '2026-03-22', endDate: '2026-03-24' }, MARCH_22)).toBe(
      'during'
    );
    expect(resolveShowTimePhase({ startDate: '2026-03-20', endDate: '2026-03-22' }, MARCH_22)).toBe(
      'during'
    );
  });

  it('reads a finished show as after', () => {
    expect(resolveShowTimePhase({ startDate: '2026-03-18', endDate: '2026-03-20' }, MARCH_22)).toBe(
      'after'
    );
  });

  it('treats a missing endDate as a one-day show', () => {
    expect(resolveShowTimePhase({ startDate: '2026-03-22' }, MARCH_22)).toBe('during');
    expect(resolveShowTimePhase({ startDate: '2026-03-21' }, MARCH_22)).toBe('after');
  });

  it('treats an invalid end-before-start range as unknown', () => {
    expect(
      resolveShowTimePhase({ startDate: '2026-03-25', endDate: '2026-03-20' }, MARCH_22)
    ).toBe('unknown');
  });

  it('reads a show with no dates, a null show, and an undefined show as unknown', () => {
    expect(resolveShowTimePhase({}, MARCH_22)).toBe('unknown');
    expect(resolveShowTimePhase({ startDate: null, endDate: null }, MARCH_22)).toBe('unknown');
    expect(resolveShowTimePhase(null, MARCH_22)).toBe('unknown');
    expect(resolveShowTimePhase(undefined, MARCH_22)).toBe('unknown');
  });

  it('compares calendar days in LOCAL time, not UTC', () => {
    // 7pm local on the last day of a one-day show. `toISOString()` would push
    // this to the next UTC day anywhere west of Greenwich and demote the show to
    // 'after' while the secretary is still closing out at the venue.
    const eveningOfShowDay = new Date(2026, 2, 22, 19, 30, 0);
    expect(resolveShowTimePhase({ startDate: '2026-03-22' }, eveningOfShowDay)).toBe('during');
  });

  it('accepts a timestamptz as well as a date', () => {
    expect(
      resolveShowTimePhase(
        { startDate: '2026-03-22T00:00:00+00:00', endDate: '2026-03-24T00:00:00+00:00' },
        MARCH_22
      )
    ).toBe('during');
  });
});

describe('orderReportPhases', () => {
  const ALL: ReportPhase[] = ['before', 'during', 'after', 'anytime'];

  it('leads with Before for an upcoming show', () => {
    expect(orderReportPhases('before')).toEqual(['before', 'during', 'after', 'anytime']);
  });

  it('leads with During while the show is running', () => {
    // The point of the whole function: Check-in Sheet and Score Sheet are the
    // first two reports a secretary sees on show day, not the twelfth and
    // thirteenth (REV-2341 P2-Q2).
    expect(orderReportPhases('during')).toEqual(['during', 'after', 'before', 'anytime']);
  });

  it('leads with After once the show is over', () => {
    expect(orderReportPhases('after')).toEqual(['after', 'during', 'before', 'anytime']);
  });

  it('falls back to the plain show order when the phase is unknown', () => {
    expect(orderReportPhases('unknown')).toEqual(DEFAULT_REPORT_PHASE_ORDER);
    expect(orderReportPhases('unknown')).toEqual(['before', 'during', 'after', 'anytime']);
  });

  it('returns every phase exactly once in every state, and always ends on Anytime', () => {
    // Ordering may never drop a group: the ruling is that every report stays
    // listed under its own heading in every state, and nothing is gated.
    for (const phase of ['before', 'during', 'after', 'unknown'] as const) {
      const order = orderReportPhases(phase);
      expect([...order].sort()).toEqual([...ALL].sort());
      expect(order).toHaveLength(4);
      expect(order[3]).toBe('anytime');
    }
  });

  it('never hides a report: every registry phase is a phase the order emits', () => {
    const emitted = new Set(orderReportPhases('during'));
    for (const report of reportRegistry) {
      expect(emitted.has(report.phase), `report ${report.id} phase ${report.phase}`).toBe(true);
    }
  });
});
