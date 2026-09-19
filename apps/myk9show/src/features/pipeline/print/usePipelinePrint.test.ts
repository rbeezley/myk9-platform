import { describe, expect, it } from 'vitest';
import { mapEntry } from './usePipelinePrint';

describe('mapEntry', () => {
  it('uses the assigned handler from the entry before the dog owner', () => {
    const entry = mapEntry({
      id: 'entry-1',
      handler_id: 'person-handler-1',
      handler: 'Jamie Handler',
      armband: '12',
      dog: {
        call_name: 'Rex',
        breed: 'Labrador Retriever',
        owner: { first_name: 'Pat', last_name: 'Owner' },
      },
    });

    expect(entry.handlerName).toBe('Jamie Handler');
  });

  it('keeps the stored entry handler text ahead of a joined person name', () => {
    const entry = mapEntry({
      id: 'entry-joined-person',
      handler: 'Jamie Handler',
      handler_person: { first_name: 'Renamed', last_name: 'Handler' },
      dog: {
        call_name: 'Rex',
        owner: { first_name: 'Pat', last_name: 'Owner' },
      },
    });

    expect(entry.handlerName).toBe('Jamie Handler');
  });

  it('falls back to the dog owner when an entry has no assigned handler', () => {
    const entry = mapEntry({
      id: 'entry-2',
      handler: null,
      armband: '13',
      dog: {
        call_name: 'Mia',
        breed: 'Beagle',
        owner: { first_name: 'Pat', last_name: 'Owner' },
      },
    });

    expect(entry.handlerName).toBe('Pat Owner');
  });
});
