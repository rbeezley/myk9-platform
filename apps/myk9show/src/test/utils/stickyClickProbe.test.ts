/**
 * Known-answer tests for the sticky-chrome click probe's pure half (MYK9-543).
 *
 * These exist because the two previous rounds of this helper shipped geometry
 * bugs that no test could see: the band arithmetic lived inside a Playwright
 * helper, under `e2e/`, which vitest does not run. Everything decidable without
 * a browser now lives in `stickyClickProbe.ts` and is pinned here.
 */

import { describe, expect, it } from 'vitest';
import {
  describeBox,
  describeHitElement,
  formatProbeFailure,
  probeStepForViewport,
  scrollProbeOffsets,
  type ProbeOutcome,
} from './stickyClickProbe';

describe('scrollProbeOffsets', () => {
  it('tries the current position first, then walks outward in both directions', () => {
    expect(scrollProbeOffsets(100, 3)).toEqual([0, 100, -100, 200, -200, 300, -300]);
  });

  it('returns only the current position when there is no room to step', () => {
    expect(scrollProbeOffsets(100, 0)).toEqual([0]);
    expect(scrollProbeOffsets(0, 5)).toEqual([0]);
    expect(scrollProbeOffsets(Number.NaN, 5)).toEqual([0]);
  });

  it('never repeats an offset, so no probe is paid for twice', () => {
    const offsets = scrollProbeOffsets(242, 4);
    expect(new Set(offsets).size).toBe(offsets.length);
  });
});

describe('probeStepForViewport', () => {
  it('is a twelfth of the viewport height', () => {
    expect(probeStepForViewport(727)).toBe(61); // Pixel 5
    expect(probeStepForViewport(844)).toBe(70); // iPhone 13
    expect(probeStepForViewport(720)).toBe(60); // desktop chromium
  });

  it('stays smaller than the gap the wizard chrome leaves on a phone', () => {
    // 393x727 with a tall "Your entries" drawer leaves ~193px between the
    // wizard header and the entries bar. A step at or above that strides over
    // the only clickable band, which is exactly how the first cut failed.
    expect(probeStepForViewport(727)).toBeLessThan(193);
    expect(probeStepForViewport(664)).toBeLessThan(193); // iPhone 13 with the PWA banner
  });

  it('never returns a degenerate step', () => {
    expect(probeStepForViewport(60)).toBe(40);
    expect(probeStepForViewport(0)).toBe(40);
    expect(probeStepForViewport(-5)).toBe(40);
  });
});

describe('describeHitElement', () => {
  it('names the tag, test id, role, text and box of the winner', () => {
    expect(
      describeHitElement({
        tag: 'HEADER',
        testId: 'registration-wizard-header',
        role: null,
        text: 'Dogs',
        box: { x: 0, y: 48, width: 393, height: 367 },
      })
    ).toBe('header[data-testid="registration-wizard-header"] "Dogs" [x=0 y=48 w=393 h=367]');
  });

  it('says what it means when nothing was hit, rather than printing "null"', () => {
    expect(describeHitElement(null)).toContain('nothing');
  });
});

describe('describeBox', () => {
  it('rounds, and distinguishes a missing box from a zero-sized one', () => {
    expect(describeBox({ x: 71.6, y: 356.4, width: 16, height: 16 })).toBe('x=72 y=356 w=16 h=16');
    expect(describeBox({ x: 0, y: 0, width: 0, height: 0 })).toBe('x=0 y=0 w=0 h=0');
    expect(describeBox(null)).toBe('no box');
  });
});

describe('formatProbeFailure', () => {
  const outcome = (scrollTop: number, tag: string, testId: string | null): ProbeOutcome => ({
    accepted: false,
    scrollTop,
    targetBox: { x: 72, y: 356, width: 16, height: 16 },
    hit: { tag, testId, role: null, text: '', box: { x: 0, y: 0, width: 393, height: 367 } },
  });

  it('reports every distinct interceptor, the target box and the positions tried', () => {
    const message = formatProbeFailure('the dog row', { width: 393, height: 727 }, [
      outcome(428, 'HEADER', 'registration-wizard-header'),
      outcome(670, 'DIV', 'entries-panel-bar'),
      outcome(186, 'HEADER', 'registration-wizard-header'),
    ]);
    expect(message).toContain('the dog row is covered at every scroll position tried at 393x727');
    expect(message).toContain('Target box: x=72 y=356 w=16 h=16');
    expect(message).toContain('Scroll positions tried: 428, 670, 186');
    expect(message).toContain('header[data-testid="registration-wizard-header"]');
    expect(message).toContain('div[data-testid="entries-panel-bar"]');
    // The header won twice; it is reported once.
    expect(message.match(/registration-wizard-header/g)).toHaveLength(1);
  });

  it('names an interceptor that no overlay list knows about', () => {
    // The exact regression of round 2: the fixed AppHeader is in no list, and
    // the old message could only say "blocked: []".
    const message = formatProbeFailure('the dog row', { width: 393, height: 727 }, [
      outcome(0, 'HEADER', 'app-header'),
    ]);
    expect(message).toContain('header[data-testid="app-header"]');
  });

  it('survives a run where nothing was hit at all', () => {
    const message = formatProbeFailure('the Next button', { width: 393, height: 727 }, [
      { accepted: false, hit: null, targetBox: null, scrollTop: 0 },
    ]);
    expect(message).toContain('Target box: no box');
    expect(message).toContain('nothing');
  });

  it('survives an empty outcome list rather than printing undefined', () => {
    const message = formatProbeFailure('the dog row', { width: 393, height: 727 }, []);
    expect(message).toContain('Scroll positions tried: none');
    expect(message).toContain('none recorded');
  });
});
