import { describe, expect, it } from 'vitest';
import { summarizeObservedPeaks } from './loadPlatformPeaks';
import {
  parsePrometheusResourceCounters,
  resourceUtilization,
  statementDeltas,
} from './loadPlatformSampler';

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
});

describe('observed peaks survive partial sampling (MYK9-126)', () => {
  // The gate fields stay NaN on any sampling loss — that zero-tolerance is
  // deliberate and documented in the sampler, and loadEvaluation fails on
  // `resourceSampling.failures` independently. But NaN-ing the gate field also
  // threw away the measurement, so the 2026-08-28 rehearsal reported
  // "Platform CPU/IO peak: NaN / NaN%" while holding 10 successful resource
  // samples and 358 successful connection samples. That left the one question
  // the run existed to answer — was the instance saturated — unanswerable.
  //
  // These assert the observed values are REPORTED, not that the gate passes.
  it('keeps the gate fields NaN when a resource sample was lost', () => {
    const observed = summarizeObservedPeaks({
      peakCpuPercent: 87.4,
      peakIoPercent: 12.5,
      peakConnections: 41,
      resourceFailures: [{ kind: 'timeout', count: 4 }],
      connectionAttempts: 383,
      connectionSuccesses: 358,
    });
    expect(Number.isNaN(observed.peakCpuPercent)).toBe(true);
    expect(Number.isNaN(observed.peakIoPercent)).toBe(true);
    expect(Number.isNaN(observed.peakConnections)).toBe(true);
  });

  it('still reports what was actually observed, as a lower bound', () => {
    const observed = summarizeObservedPeaks({
      peakCpuPercent: 87.4,
      peakIoPercent: 12.5,
      peakConnections: 41,
      resourceFailures: [{ kind: 'timeout', count: 4 }],
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
      resourceFailures: [],
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
      resourceFailures: [{ kind: 'timeout', count: 1 }],
      connectionAttempts: 10,
      connectionSuccesses: 0,
    });
    expect(observed.observedPeakCpuPercent).toBeUndefined();
    expect(observed.observedPeakConnections).toBeUndefined();
  });
});
