import { describe, expect, it } from 'vitest';
import {
  esc,
  escMultiline,
  formatDogLine,
  formatRunCountLabel,
  hasOnTheDayDetails,
} from './confirmation-email-shared';

describe('confirmation-email-shared', () => {
  it('escapes HTML-sensitive characters', () => {
    expect(esc('<Trial "A" & friends>')).toBe('&lt;Trial &quot;A&quot; &amp; friends&gt;');
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
  });

  it('escapes multiline text and preserves line breaks as br tags', () => {
    expect(escMultiline('Line <1>\nLine & 2')).toBe('Line &lt;1&gt;<br/>Line &amp; 2');
  });

  it('formats Magazine and Gazette dog lines without escaping prematurely', () => {
    const dog = { dogCallName: 'Cooper', dogBreed: 'GSP', dogSex: 'F' };
    expect(formatDogLine(dog, { callNameStyle: 'called' })).toBe('called "Cooper" · GSP · F');
    expect(formatDogLine(dog, { callNameStyle: 'quoted' })).toBe('"Cooper" · GSP · F');
  });

  it('formats singular and plural run-count labels', () => {
    expect(formatRunCountLabel(1)).toBe('1 run');
    expect(formatRunCountLabel(2)).toBe('2 runs');
  });

  it('detects on-the-day details from any populated field', () => {
    const empty = {
      doorsTime: null,
      firstClassTime: null,
      venue: null,
      parkingNotes: null,
      hospitalityNotes: null,
      cratingNotes: null,
    };

    expect(hasOnTheDayDetails(empty)).toBe(false);
    expect(hasOnTheDayDetails({ ...empty, venue: 'Live Oak Civic Center' })).toBe(true);
    expect(hasOnTheDayDetails({ ...empty, doorsTime: '' })).toBe(false);
  });
});
