import { describe, expect, it } from 'vitest';

import { dropPosition, runOrderAnnouncements } from './runOrderDrag';

const ids = ['a', 'b', 'c', 'd'];

describe('dropPosition (MYK9-1872)', () => {
  it.each([
    ['down one', 'a', 'b', 2],
    ['down to the bottom', 'a', 'd', 4],
    ['up one', 'c', 'b', 2],
    ['up to the top', 'd', 'a', 1],
  ])('moving %s gives the 1-based slot among waiting dogs', (_name, active, over, expected) => {
    expect(dropPosition(ids, active, over)).toBe(expected);
  });

  it('is null when dropped on itself, nowhere, or on a row that is not movable', () => {
    expect(dropPosition(ids, 'b', 'b')).toBeNull();
    expect(dropPosition(ids, 'b', null)).toBeNull();
    expect(dropPosition(ids, 'b', 'scored-row')).toBeNull();
    expect(dropPosition(ids, 'scored-row', 'b')).toBeNull();
  });
});

describe('runOrderAnnouncements (MYK9-1872)', () => {
  const items = [
    { id: 'entry:uuid-1', label: '#101 Moss' },
    { id: 'entry:uuid-2', label: '#103 Juno' },
    { id: 'entry:uuid-3', label: '#110 Hazel' },
  ];
  const say = runOrderAnnouncements(items);
  const hazel = { id: 'entry:uuid-3' };

  it('speaks dog names and slots, never ids', () => {
    expect(say.onDragStart({ active: hazel })).toBe('Picked up #110 Hazel, position 3 of 3');
    expect(say.onDragOver({ active: hazel, over: { id: 'entry:uuid-2' } })).toBe(
      '#110 Hazel moved to position 2 of 3'
    );
    expect(say.onDragEnd({ active: hazel, over: { id: 'entry:uuid-2' } })).toBe(
      '#110 Hazel dropped at position 2. Run order saved'
    );
    expect(say.onDragCancel({ active: hazel })).toBe(
      'Move cancelled. #110 Hazel stays at position 3'
    );
  });

  it('says nothing changed for a drop on itself or nowhere', () => {
    expect(say.onDragOver({ active: hazel, over: hazel })).toBe('#110 Hazel at position 3 of 3');
    expect(say.onDragEnd({ active: hazel, over: hazel })).toContain('Run order unchanged');
    expect(say.onDragEnd({ active: hazel, over: null })).toContain('still position 3');
    expect(say.onDragOver({ active: hazel, over: null })).toBe('#110 Hazel is not over a position');
  });
});
