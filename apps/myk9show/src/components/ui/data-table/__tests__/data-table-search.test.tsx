import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { type ColumnDef } from '@tanstack/react-table';
import { DataTable } from '../index';
import { DataTableToolbar } from '../data-table-toolbar';
import { DataTableSearch } from '../data-table-search';

interface TestRow {
  id: string;
  name: string;
  email: string;
}

const testData: TestRow[] = [
  { id: '1', name: 'Alice', email: 'alice@test.com' },
  { id: '2', name: 'Bob', email: 'bob@test.com' },
  { id: '3', name: 'Charlie', email: 'charlie@test.com' },
];

const columns: ColumnDef<TestRow>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'email', header: 'Email' },
];

describe('DataTableSearch', () => {
  it('filters rows by search term', async () => {
    const { user } = render(
      <DataTable
        columns={columns}
        data={testData}
        toolbar={({ table }) => (
          <DataTableToolbar table={table}>
            <DataTableSearch placeholder="Search..." />
          </DataTableToolbar>
        )}
      />
    );
    const searchInput = screen.getByPlaceholderText('Search...');
    await user.type(searchInput, 'Alice');
    await new Promise(r => setTimeout(r, 400));
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.queryByText('Bob')).not.toBeInTheDocument();
    expect(screen.queryByText('Charlie')).not.toBeInTheDocument();
  });

  it('shows all rows when search is cleared', async () => {
    const { user } = render(
      <DataTable
        columns={columns}
        data={testData}
        toolbar={({ table }) => (
          <DataTableToolbar table={table}>
            <DataTableSearch placeholder="Search..." />
          </DataTableToolbar>
        )}
      />
    );
    const searchInput = screen.getByPlaceholderText('Search...');
    await user.type(searchInput, 'Alice');
    await new Promise(r => setTimeout(r, 400));
    await user.clear(searchInput);
    await new Promise(r => setTimeout(r, 400));
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Charlie')).toBeInTheDocument();
  });
});
