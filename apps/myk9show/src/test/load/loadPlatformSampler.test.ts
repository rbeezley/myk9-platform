import { describe, expect, it } from 'vitest';
import { summarizeObservedPeaks } from './loadPlatformPeaks';
import {
  parsePrometheusResourceCounters,
  resourceUtilization,
  statementDeltas,
} from './loadPlatformSampler';
import { parseScheduledWriteSnapshot, scheduledWriteDeltas } from './loadScheduledWriteEvidence';

describe('load platform sampler', () => {
  it('computes statement deltas and ranks by rehearsal total time', () => {
    const baseline = new Map([
      ['slow', { calls: 10, rows: 10, totalExecTimeMs: 100 }],
      ['fast', { calls: 20, rows: 20, totalExecTimeMs: 50 }],
    ]);
    const finalSnapshot = new Map([
      ['slow', { calls: 12, rows: 14, totalExecTimeMs: 160 }],
      ['fast', { calls: 30, rows: 30, totalExecTimeMs: 70 }],
    ]);

    expect(statementDeltas(baseline, finalSnapshot)).toEqual([
      {
        queryId: 'slow',
        calls: 2,
        rows: 4,
        totalExecTimeMs: 60,
        meanExecTimeMs: 30,
      },
      {
        queryId: 'fast',
        calls: 10,
        rows: 10,
        totalExecTimeMs: 20,
        meanExecTimeMs: 2,
      },
    ]);
  });

  it('calculates CPU and disk utilization from Supabase Prometheus counter deltas', () => {
    const previous = parsePrometheusResourceCounters(`
node_cpu_seconds_total{cpu="0",mode="idle"} 100
node_cpu_seconds_total{cpu="0",mode="user"} 20
node_cpu_seconds_total{cpu="0",mode="system"} 10
node_disk_io_time_seconds_total{device="nvme0n1"} 50
`);
    const current = parsePrometheusResourceCounters(`
node_cpu_seconds_total{cpu="0",mode="idle"} 106
node_cpu_seconds_total{cpu="0",mode="user"} 23
node_cpu_seconds_total{cpu="0",mode="system"} 11
node_disk_io_time_seconds_total{device="nvme0n1"} 50.5
`);

    expect(resourceUtilization(previous, current, 10)).toEqual({
      cpuPercent: 40,
      ioPercent: 5,
    });
  });

  it('fails closed when the Metrics API omits required counters', () => {
    expect(() =>
      parsePrometheusResourceCounters('node_cpu_seconds_total{cpu="0",mode="idle"} 100')
    ).toThrow('omitted CPU or disk IO counters');
  });

  it('parses bounded scheduled-writer counts and reports only new writes', () => {
    const before = parseScheduledWriteSnapshot(
      'cron:continuous-health-check|12\nhealth:cron-health-check:continuous|4\n'
    );
    const after = parseScheduledWriteSnapshot(
      'cron:continuous-health-check|24\nhealth:cron-health-check:continuous|5\n'
    );

    expect(scheduledWriteDeltas(before, after)).toEqual([
      {
        source: 'cron:continuous-health-check',
        unit: 'job_runs',
        before: 12,
        after: 24,
        writes: 12,
      },
      {
        source: 'health:cron-health-check:continuous',
        unit: 'rows',
        before: 4,
        after: 5,
        writes: 1,
      },
    ]);
  });

  it('rejects malformed scheduled-writer evidence', () => {
    expect(() => parseScheduledWriteSnapshot('cron:job|not-a-count')).toThrow(/invalid row/);
  });
});

describe('observed peaks survive partial sampling (MYK9-126)', () => {
  it('keeps valid resource peaks usable when a resource sample was lost', () => {
    const observed = summarizeObservedPeaks({
      peakCpuPercent: 87.4,
      peakIoPercent: 12.5,
      peakConnections: 41,
      connectionAttempts: 383,
      connectionSuccesses: 358,
    });
    expect(observed.peakCpuPercent).toBe(87.4);
    expect(observed.peakIoPercent).toBe(12.5);
    expect(Number.isNaN(observed.peakConnections)).toBe(true);
  });

  it('still reports what was actually observed, as a lower bound', () => {
    const observed = summarizeObservedPeaks({
      peakCpuPercent: 87.4,
      peakIoPercent: 12.5,
      peakConnections: 41,
      connectionAttempts: 383,
      connectionSuccesses: 358,
    });
    expect(observed.observedPeakCpuPercent).toBe(87.4);
    expect(observed.observedPeakIoPercent).toBe(12.5);
    expect(observed.observedPeakConnections).toBe(41);
  });

  it('reports both when sampling was complete', () => {
    const observed = summarizeObservedPeaks({
      peakCpuPercent: 55,
      peakIoPercent: 4,
      peakConnections: 30,
      connectionAttempts: 100,
      connectionSuccesses: 100,
    });
    expect(observed.peakCpuPercent).toBe(55);
    expect(observed.observedPeakCpuPercent).toBe(55);
    expect(observed.peakConnections).toBe(30);
    expect(observed.observedPeakConnections).toBe(30);
  });

  it('leaves the observed value undefined when nothing was sampled', () => {
    const observed = summarizeObservedPeaks({
      peakCpuPercent: Number.NaN,
      peakIoPercent: Number.NaN,
      peakConnections: 0,
      connectionAttempts: 10,
      connectionSuccesses: 0,
    });
    expect(observed.observedPeakCpuPercent).toBeUndefined();
    expect(observed.observedPeakConnections).toBeUndefined();
  });
});
