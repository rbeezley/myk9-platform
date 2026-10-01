import { describe, it, expect, vi } from 'vitest';
import type { ShowFilters } from '@/hooks/useBrowseShowsFilters';
import type { ListOptionsFilterField } from '@/components/list-toolkit';
import { buildShowBrowseFilterFields } from '../showBrowseFilterFields';

const BASE_FILTERS: ShowFilters = {
  search: '',
  discipline: 'all',
  entryStatus: 'all',
  month: 'all',
  club: 'all',
  radius: 'all',
  status: 'all',
};

function asOptionsField(
  fields: ReturnType<typeof buildShowBrowseFilterFields>,
  key: string
): ListOptionsFilterField {
  const field = fields.find(f => f.key === key);
  if (!field || field.kind !== 'options') throw new Error(`expected options field "${key}"`);
  return field;
}

describe('buildShowBrowseFilterFields', () => {
  it('omits the Distance field with no known location', () => {
    const fields = buildShowBrowseFilterFields({
      filters: BASE_FILTERS,
      onFiltersChange: vi.fn(),
      clubOptions: [],
      hasLocation: false,
    });
    expect(fields.map(f => f.key)).toEqual(['discipline', 'entryStatus', 'club']);
  });

  it('adds the Distance field once a location is known', () => {
    const fields = buildShowBrowseFilterFields({
      filters: BASE_FILTERS,
      onFiltersChange: vi.fn(),
      clubOptions: [],
      hasLocation: true,
    });
    expect(fields.map(f => f.key)).toEqual(['discipline', 'entryStatus', 'club', 'radius']);
  });

  it('reads the current value from filters, null when at default', () => {
    const fields = buildShowBrowseFilterFields({
      filters: { ...BASE_FILTERS, discipline: 'agility', club: 'club-1' },
      onFiltersChange: vi.fn(),
      clubOptions: [{ label: 'Club One', value: 'club-1' }],
      hasLocation: false,
    });
    expect(asOptionsField(fields, 'discipline').value).toBe('agility');
    expect(asOptionsField(fields, 'club').value).toBe('club-1');
    expect(asOptionsField(fields, 'entryStatus').value).toBeNull();
  });

  it('onChange writes the picked value, or "all" when cleared', () => {
    const onFiltersChange = vi.fn();
    const fields = buildShowBrowseFilterFields({
      filters: BASE_FILTERS,
      onFiltersChange,
      clubOptions: [],
      hasLocation: false,
    });

    asOptionsField(fields, 'discipline').onChange('scent_work');
    const updater1 = onFiltersChange.mock.calls[0][0];
    expect(updater1(BASE_FILTERS).discipline).toBe('scent_work');

    asOptionsField(fields, 'discipline').onChange(null);
    const updater2 = onFiltersChange.mock.calls[1][0];
    expect(updater2({ ...BASE_FILTERS, discipline: 'scent_work' }).discipline).toBe('all');
  });

  it('passes the club options through unchanged', () => {
    const clubOptions = [
      { label: 'Alpha Club', value: 'club-a' },
      { label: 'Beta Club', value: 'club-b' },
    ];
    const fields = buildShowBrowseFilterFields({
      filters: BASE_FILTERS,
      onFiltersChange: vi.fn(),
      clubOptions,
      hasLocation: false,
    });
    expect(asOptionsField(fields, 'club').options).toEqual(clubOptions);
  });
});
