import { describe, expect, it } from 'vitest';
import type { ShowDeskToolSection } from '@/features/show-map/ShowDeskToolsSheet';
import { filterShowDeskTools, type ShowDeskToolSwitches } from './showDeskToolSwitches';

const ids = [
  'people-at-show',
  'self-checkin',
  'access-codes',
  'emergency-trial-packet',
  'volunteers',
  'lunch-orders',
  'tasks-notes',
  'incident-log',
];
const tools = ids.map(id => ({
  id,
  group: 'show-day',
  title: id,
  summary: id,
  content: null,
})) as unknown as ShowDeskToolSection[];

const allOn: ShowDeskToolSwitches = {
  selfCheckin: true,
  deviceScoring: true,
  paperPacket: true,
  volunteers: true,
};

describe('filterShowDeskTools (MYK9-1685)', () => {
  it('keeps every row when every switch is on', () => {
    expect(filterShowDeskTools(tools, allOn).map(t => t.id)).toEqual(ids);
  });

  it.each([
    ['selfCheckin', 'self-checkin'],
    ['deviceScoring', 'access-codes'],
    ['paperPacket', 'emergency-trial-packet'],
    ['volunteers', 'volunteers'],
  ] as const)('%s off hides only %s, and on restores it', (key, id) => {
    const off = filterShowDeskTools(tools, { ...allOn, [key]: false }).map(t => t.id);
    expect(off).toEqual(ids.filter(candidate => candidate !== id));
    const on = filterShowDeskTools(tools, { ...allOn, [key]: true }).map(t => t.id);
    expect(on).toContain(id);
  });

  it('keeps all rows while every value is still unknown', () => {
    const unknown = {
      selfCheckin: undefined,
      deviceScoring: undefined,
      paperPacket: undefined,
      volunteers: undefined,
    };
    expect(filterShowDeskTools(tools, unknown).map(t => t.id)).toEqual(ids);
  });
});
