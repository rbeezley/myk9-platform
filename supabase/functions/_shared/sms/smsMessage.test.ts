import { describe, expect, it } from 'vitest';
import {
  buildProximitySms,
  estimateSegments,
  gsm7Length,
  GSM7_SEGMENT_LIMIT,
  isGsm7,
  toE164,
  toGsm7Safe,
} from './smsMessage';

describe('GSM-7 detection — the cost lever', () => {
  it('accepts plain ASCII', () => {
    expect(isGsm7('Cooper (#314) is 3 dogs out in Excellent Interiors')).toBe(true);
  });

  it('rejects an emoji, which would force UCS-2 and halve the segment size', () => {
    expect(isGsm7('Cooper is up next 🐕')).toBe(false);
  });

  it('rejects the curly quotes and en dashes that arrive via copy-paste', () => {
    expect(isGsm7('Cooper’s class')).toBe(false);
    expect(isGsm7('Novice – A')).toBe(false);
  });

  it('counts extension characters as two septets, not one', () => {
    expect(gsm7Length('abc')).toBe(3);
    expect(gsm7Length('a{b')).toBe(4);
  });
});

describe('estimateSegments', () => {
  it('keeps a normal alert to one GSM-7 segment', () => {
    const estimate = estimateSegments('Cooper (#314) is 3 dogs out in Excellent Interiors - myK9Show');
    expect(estimate.encoding).toBe('GSM-7');
    expect(estimate.segments).toBe(1);
  });

  it('shows the real penalty: one emoji doubles a mid-length message', () => {
    const text = 'x'.repeat(130);
    expect(estimateSegments(text).segments).toBe(1);
    // Same length plus one emoji -> UCS-2, 70 per segment -> 2 segments.
    const withEmoji = estimateSegments(`${text}🐕`);
    expect(withEmoji.encoding).toBe('UCS-2');
    expect(withEmoji.segments).toBe(2);
  });

  it('never reports zero segments for an empty string', () => {
    expect(estimateSegments('').segments).toBe(1);
  });
});

describe('toGsm7Safe', () => {
  it('maps smart typography to its GSM-7 equivalent instead of dropping it', () => {
    expect(toGsm7Safe('Cooper’s “big” day – ready…')).toBe(`Cooper's "big" day - ready...`);
  });

  it('drops characters it cannot map rather than flipping the encoding', () => {
    expect(isGsm7(toGsm7Safe('Bella 🐕 Novice'))).toBe(true);
    expect(toGsm7Safe('Bella 🐕 Novice')).toBe('Bella Novice');
  });

  it('collapses the whitespace left behind by dropped characters', () => {
    expect(toGsm7Safe('A  🐕  B')).toBe('A B');
  });
});

describe('buildProximitySms', () => {
  it('states the count, the dog and the armband', () => {
    const msg = buildProximitySms({
      dogName: 'Cooper',
      className: 'Excellent Interiors',
      dogsAhead: 3,
      armband: 314,
    });
    expect(msg).toBe('Cooper (#314) is 3 dogs out in Excellent Interiors - myK9Show');
  });

  it('says "up next" at zero rather than "0 dogs out"', () => {
    const msg = buildProximitySms({
      dogName: 'Cooper',
      className: 'Novice',
      dogsAhead: 0,
      armband: null,
    });
    expect(msg).toBe('Cooper is up next in Novice - myK9Show');
  });

  it('degrades to a generic subject when the dog is unknown', () => {
    const msg = buildProximitySms({
      dogName: null,
      className: 'Novice',
      dogsAhead: 2,
      armband: null,
    });
    expect(msg.startsWith('Your dog is 2 dogs out')).toBe(true);
  });

  it('ALWAYS fits one GSM-7 segment, even with an absurd class name', () => {
    const msg = buildProximitySms({
      dogName: 'Cooper',
      className: 'Excellent '.repeat(40),
      dogsAhead: 3,
      armband: 314,
    });
    const estimate = estimateSegments(msg);
    expect(estimate.encoding).toBe('GSM-7');
    expect(estimate.segments).toBe(1);
    expect(estimate.length).toBeLessThanOrEqual(GSM7_SEGMENT_LIMIT);
  });

  it('budgets GSM-7 extension characters by septets, not code units', () => {
    const msg = buildProximitySms({
      dogName: 'Cooper',
      className: '\\'.repeat(120),
      dogsAhead: 3,
      armband: 314,
    });
    const estimate = estimateSegments(msg);
    expect(estimate.encoding).toBe('GSM-7');
    expect(estimate.segments).toBe(1);
    expect(estimate.length).toBeLessThanOrEqual(GSM7_SEGMENT_LIMIT);
  });

  it('sanitizes names that arrive with typography or emoji', () => {
    const msg = buildProximitySms({
      dogName: 'Café 🐕',
      className: 'Novice – A',
      dogsAhead: 1,
      armband: null,
    });
    expect(isGsm7(msg)).toBe(true);
    expect(estimateSegments(msg).segments).toBe(1);
  });

  it('keeps the count and dog when the class name is trimmed away entirely', () => {
    const msg = buildProximitySms({
      dogName: 'Cooper',
      className: '🐕🐕🐕',
      dogsAhead: 2,
      armband: 314,
    });
    expect(msg).toBe('Cooper (#314) is 2 dogs out - myK9Show');
  });
});

describe('toE164', () => {
  it('accepts a bare US 10-digit number as an exhibitor would type it', () => {
    expect(toE164('2105550142')).toBe('+12105550142');
    expect(toE164('(210) 555-0142')).toBe('+12105550142');
    expect(toE164('210.555.0142')).toBe('+12105550142');
  });

  it('accepts an 11-digit number already carrying the country code', () => {
    expect(toE164('12105550142')).toBe('+12105550142');
  });

  it('passes through an explicit international number', () => {
    expect(toE164('+442071838750')).toBe('+442071838750');
  });

  it('returns null rather than guessing at something unusable', () => {
    // Sending to a wrong number is a TCPA problem, not a UX inconvenience.
    expect(toE164('')).toBeNull();
    expect(toE164('555-0142')).toBeNull();
    expect(toE164('not a phone')).toBeNull();
    expect(toE164('+0123456789')).toBeNull();
    expect(toE164(`+${'9'.repeat(16)}`)).toBeNull();
  });
});
