import { describe, expect, it, vi } from 'vitest';

import {
  HOSTED_MAX_ROWS,
  SCALE_ALERT_SOURCE,
  SCALE_THRESHOLDS,
  crossedThresholds,
  runScaleLimitsCheck,
  scaleDedupeKey,
  type ScaleCounts,
} from './scaleLimitsAlert';

const base: ScaleCounts = { people: 88, dogs: 74, classes: 296, liveClubs: 1 };

function harness(counts: ScaleCounts | { error: string }, existing: string[] = []) {
  const raiseAlert = vi.fn().mockResolvedValue(undefined);
  const alertExists = vi.fn(async (_source: string, key: string) => existing.includes(key));
  const readCounts = vi.fn().mockResolvedValue(counts);
  return {
    raiseAlert,
    alertExists,
    readCounts,
    run: () => runScaleLimitsCheck({ readCounts, alertExists, raiseAlert }),
  };
}

describe('scale limit thresholds', () => {
  it('pins the numbers the owner decided', () => {
    expect(SCALE_THRESHOLDS).toEqual({ people: 800, dogs: 10_000, classes: 5_000, liveClubs: 10 });
  });

  it('alerts on people before the first person would be dropped by the row limit', () => {
    expect(SCALE_THRESHOLDS.people).toBe(HOSTED_MAX_ROWS * 0.8);
    expect(SCALE_THRESHOLDS.people).toBeLessThan(HOSTED_MAX_ROWS);
    expect(crossedThresholds({ ...base, people: HOSTED_MAX_ROWS - 1 })).toContain('people');
  });
});

describe('runScaleLimitsCheck', () => {
  it("stays quiet at today's production numbers", async () => {
    const h = harness(base);
    expect(await h.run()).toEqual({ status: 'below' });
    expect(h.raiseAlert).not.toHaveBeenCalled();
  });

  it.each([
    ['people', { people: 800 }],
    ['dogs', { dogs: 10_000 }],
    ['classes', { classes: 5_000 }],
    ['liveClubs', { liveClubs: 10 }],
  ] as const)('alerts when %s reaches its number, and not one below', async (key, over) => {
    const below = harness({ ...base, [key]: SCALE_THRESHOLDS[key] - 1 });
    expect((await below.run()).status).toBe('below');
    expect(below.raiseAlert).not.toHaveBeenCalled();

    const h = harness({ ...base, ...over });
    expect((await h.run()).status).toBe('alerted');
    expect(h.raiseAlert).toHaveBeenCalledTimes(1);
    expect(h.raiseAlert).toHaveBeenCalledWith(
      expect.stringContaining('Scale limit reached'),
      expect.any(String),
      expect.objectContaining({
        severity: 'warn',
        source: SCALE_ALERT_SOURCE,
        dedupeKey: scaleDedupeKey([key]),
        detail: expect.objectContaining({ counts: { ...base, ...over } }),
      })
    );
  });

  it('names all four counts in the one alert', async () => {
    const h = harness({ ...base, people: 900 });
    await h.run();
    const html = h.raiseAlert.mock.calls[0][1] as string;
    for (const label of ['People: 900', 'Dogs: 74', 'Classes: 296', 'Live clubs: 1']) {
      expect(html).toContain(label);
    }
  });

  it('does not repeat: a set already alerted (even if resolved) is not sent again', async () => {
    const counts = { ...base, dogs: 12_000 };
    const first = harness(counts);
    await first.run();
    const key = (first.raiseAlert.mock.calls[0][2] as { dedupeKey: string }).dedupeKey;

    const second = harness(counts, [key]);
    expect(await second.run()).toEqual({ status: 'already_alerted', dedupeKey: key });
    expect(second.raiseAlert).not.toHaveBeenCalled();
  });

  it('alerts again when a further count crosses, since that is a new set', async () => {
    const dogsOnly = scaleDedupeKey(['dogs']);
    const h = harness({ ...base, dogs: 12_000, liveClubs: 10 }, [dogsOnly]);
    expect((await h.run()).status).toBe('alerted');
    expect(h.raiseAlert).toHaveBeenCalledTimes(1);
  });

  it('never throws and never alerts when counts or the lookup fail', async () => {
    const a = harness({ error: 'boom' });
    expect(await a.run()).toEqual({ status: 'error', message: 'boom' });
    const b = harness({ ...base, dogs: 20_000 });
    b.alertExists.mockRejectedValueOnce(new Error('down'));
    expect(await b.run()).toEqual({ status: 'error', message: 'down' });
    expect(a.raiseAlert).not.toHaveBeenCalled();
    expect(b.raiseAlert).not.toHaveBeenCalled();
  });
});
