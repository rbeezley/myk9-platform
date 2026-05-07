import { describe, it, expect, vi } from 'vitest';

vi.mock('@react-pdf/renderer', () => ({
  View: () => null,
  Text: () => null,
  Page: () => null,
  Image: () => null,
  StyleSheet: { create: (s: unknown) => s },
  Font: { register: vi.fn(), registerHyphenationCallback: vi.fn() },
}));

// Import after mocks so @react-pdf side effects in the module graph are stubbed.
import { firstSentence, pickWelcome } from '../EditorialCover';

describe('firstSentence', () => {
  it('returns short input unchanged', () => {
    expect(firstSentence('A short blurb.')).toBe('A short blurb.');
  });

  it('returns trimmed input under the 200-char cap unchanged (handles "Dr." abbreviation)', () => {
    const input = 'Dr. Smith founded the club. We hold trials.';
    expect(firstSentence(input)).toBe(input);
  });

  it('cuts on the first sentence terminator after the 60-char window for long input', () => {
    const long =
      'This is the first half of a long welcome message that runs comfortably past sixty chars. ' +
      'Then a second sentence begins here and continues with quite a bit more filler text to push the input above the two hundred character cap so the truncator engages.';
    const result = firstSentence(long);
    expect(result.length).toBeLessThanOrEqual(200);
    expect(result.endsWith('.')).toBe(true);
    // Doesn't include the second-sentence opener.
    expect(result).not.toContain('the truncator');
  });

  it('falls back to a word-boundary cut with ellipsis when no clean terminator exists', () => {
    const long =
      'an unending stream of lowercase words without any sentence punctuation at all that just keeps going and going and going and going and going and going and going and going and going past two hundred characters easily';
    const result = firstSentence(long);
    expect(result.endsWith('…')).toBe(true);
    expect(result.length).toBeLessThanOrEqual(181);
    // Should not split mid-word: the char before the ellipsis is a letter.
    expect(result.slice(-2, -1)).toMatch(/[a-z]/);
  });
});

describe('pickWelcome', () => {
  const fallback = 'Mar 1–3 · Veterans Hall';

  it('falls back when welcome is shorter than the min-tagline threshold', () => {
    expect(pickWelcome('Welcome.', fallback)).toBe(fallback);
  });

  it('returns the welcome (truncated to first sentence) when long enough', () => {
    const welcome = "We're glad you're joining us this spring at the trials.";
    expect(pickWelcome(welcome, fallback)).toBe(welcome);
  });

  it('falls back when welcome is null', () => {
    expect(pickWelcome(null, fallback)).toBe(fallback);
  });

  it('falls back when welcome is whitespace-only', () => {
    expect(pickWelcome('   ', fallback)).toBe(fallback);
  });
});
