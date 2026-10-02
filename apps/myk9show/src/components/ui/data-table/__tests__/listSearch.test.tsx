import { describe, expect, it } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { DataTable, type ColumnDef } from '../index';
import { filterByListSearch, matchesListSearch } from '../listSearch';

// MYK9-929 round 2: ONE search predicate, read from the column definitions, shared by every list
// that moved its search out of DataTable and by DataTable's own built-in search.

interface Row {
  id: string;
  name: string;
  label?: string;
  level: string;
  section: string;
  status: string;
  nested: { city: string };
}

const rows: Row[] = [
  {
    id: '1',
    name: 'Rex',
    label: 'Fido',
    level: 'Novice',
    section: 'A',
    status: 'Scheduled',
    nested: { city: 'Tulsa' },
  },
  {
    id: '2',
    name: 'Bella',
    level: 'Open',
    section: 'B',
    status: 'Completed',
    nested: { city: 'Dallas' },
  },
];

const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: 'name', header: 'Name' },
  // Displayed as "Novice A", so that is what finds the row.
  { id: 'level', header: 'Level', accessorFn: row => `${row.level} ${row.section}` },
  // The raw value differs from the shown label; the label is searchable through meta.
  {
    accessorKey: 'status',
    header: 'Status',
    meta: {
      searchValue: (row: unknown) => ((row as Row).status === 'Scheduled' ? 'Not started' : 'Done'),
    },
  },
  { accessorKey: 'nested.city', header: 'City' },
  { id: 'actions', header: 'Actions', cell: () => 'menu' },
];

describe('matchesListSearch', () => {
  it.each([
    ['Rex', '1'],
    ['rex', '1'],
    ['Novice A', '1'],
    ['Not started', '1'],
    ['Done', '2'],
    ['Tulsa', '1'],
    ['dallas', '2'],
    // Token-AND over one haystack per row: order and column boundaries do not matter.
    ['Rex Novice A', '1'],
    ['novice a rex', '1'],
    ['Tulsa Not started', '1'],
    ['Done Bella', '2'],
    // A name-like field the table does not show still finds the row.
    ['Fido', '1'],
  ])('"%s" finds row %s', (query, id) => {
    expect(filterByListSearch(rows, columns, query).map(row => row.id)).toEqual([id]);
  });

  it('matches everything on an empty or blank query, and nothing it cannot find', () => {
    expect(filterByListSearch(rows, columns, '   ')).toHaveLength(2);
    expect(matchesListSearch(rows[0]!, columns, 'zzz')).toBe(false);
  });

  it('does not match when any one word is missing', () => {
    expect(matchesListSearch(rows[0]!, columns, 'Rex Dallas')).toBe(false);
  });

  it('does not search a column that has no value (the actions column)', () => {
    expect(matchesListSearch(rows[0]!, columns, 'menu')).toBe(false);
  });
});

describe('DataTable built-in search uses the same predicate', () => {
  it('finds a row by a displayed label, not only the raw accessor', async () => {
    const { user } = render(<DataTable tableId="ls" columns={columns} data={rows} />);
    await user.type(screen.getByPlaceholderText('Search...'), 'Novice A');
    await new Promise(resolve => setTimeout(resolve, 400));
    expect(screen.getByText('Rex')).toBeInTheDocument();
    expect(screen.queryByText('Bella')).not.toBeInTheDocument();
  });
});
