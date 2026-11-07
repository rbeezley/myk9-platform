import { describe, expect, it } from 'vitest';
import { entryFormDogLabels } from './entryFormDogLabels';

describe('entryFormDogLabels (MYK9-1733)', () => {
  it('adds each dog its armband, and names a dog in several classes once', () => {
    expect(
      entryFormDogLabels([
        { dogId: 'd1', dogName: 'Ziva', armbandNumber: '12' },
        { dogId: 'd1', dogName: 'Ziva', armbandNumber: '12' },
        { dogId: 'd2', dogName: 'Juno' },
      ])
    ).toEqual(['Ziva #12', 'Juno']);
  });

  it('uses the armband from any of the dog’s entries when the first has none', () => {
    expect(
      entryFormDogLabels([
        { dogId: 'd1', dogName: 'Ziva' },
        { dogId: 'd1', dogName: 'Ziva', armbandNumber: ' 7 ' },
      ])
    ).toEqual(['Ziva #7']);
  });

  it('keeps two dogs that share a call name apart', () => {
    expect(
      entryFormDogLabels([
        { dogId: 'd1', dogName: 'Max', armbandNumber: '3' },
        { dogId: 'd2', dogName: 'Max', armbandNumber: '4' },
      ])
    ).toEqual(['Max #3', 'Max #4']);
  });
});
