import { describe, expect, it } from 'vitest';
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
