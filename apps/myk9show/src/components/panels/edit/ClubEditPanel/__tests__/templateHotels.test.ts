import { describe, expect, it } from 'vitest';
import { cleanTemplateHotels } from '../templateHotels';

describe('cleanTemplateHotels', () => {
  it('trims fields and drops rows left entirely blank', () => {
    expect(
      cleanTemplateHotels([
        { name: '  Inn  ', address: ' 1 Main St ', phone: ' 555-0100 ' },
        { name: ' ', address: '', phone: '' },
      ])
    ).toEqual([{ name: 'Inn', address: '1 Main St', phone: '555-0100' }]);
  });

  it('cleans a stored link with the public pages helper and drops an unsafe one', () => {
    const stored = [
      { name: 'Inn', address: '', phone: '', url: 'inn.example.com' },
      { name: 'Motel', address: '', phone: '', url: 'javascript:alert(1)' },
    ];
    expect(cleanTemplateHotels(stored)).toEqual([
      { name: 'Inn', address: '', phone: '', url: 'https://inn.example.com/' },
      { name: 'Motel', address: '', phone: '' },
    ]);
  });

  it('returns an empty list when every hotel is removed', () => {
    expect(cleanTemplateHotels([])).toEqual([]);
  });
});
