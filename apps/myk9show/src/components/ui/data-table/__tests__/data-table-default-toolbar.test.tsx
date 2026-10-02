import { render, screen } from '@/test/utils/testUtils';
import { DataTable, type ColumnDef } from '../index';

interface TestRow {
  id: string;
  name: string;
  value: number;
}

const columns: ColumnDef<TestRow, unknown>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'value', header: 'Value' },
];

const data: TestRow[] = [
  { id: '1', name: 'Alpha', value: 10 },
  { id: '2', name: 'Beta', value: 20 },
];

const pagedData: TestRow[] = Array.from({ length: 30 }, (_, index) => ({
  id: String(index + 1),
  name: `Row ${index + 1}`,
  value: index + 1,
}));

describe('DataTable default toolbar', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // MYK9-929 / owner decision 4: a table shows only search (the view toggle and the result
  // sentence belong to the list's own result line). Export lives in the bulk bar, density is one
  // comfortable size, and Columns and Reset view are gone.
  it('renders only the search box in the default toolbar', () => {
    render(<DataTable tableId="test" columns={columns} data={data} />);
    expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /toggle columns/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /export csv/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /density/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reset table view/i })).not.toBeInTheDocument();
  });

  it('renders no toolbar buttons at all when showSearch is false', () => {
    render(<DataTable tableId="test" columns={columns} data={data} showSearch={false} />);
    expect(screen.queryByPlaceholderText('Search...')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /columns|export|density|reset/i })).toBeNull();
  });

  it('does not render default toolbar when tableId is absent', () => {
    render(<DataTable columns={columns} data={data} />);
    expect(screen.queryByPlaceholderText('Search...')).not.toBeInTheDocument();
  });

  it('does not render default toolbar when custom toolbar is provided', () => {
    render(
      <DataTable
        tableId="test"
        columns={columns}
        data={data}
        toolbar={() => <div data-testid="custom-toolbar">Custom</div>}
      />
    );
    expect(screen.getByTestId('custom-toolbar')).toBeInTheDocument();
  });

  it('persists page size per table', async () => {
    const { user } = render(
      <DataTable tableId="test-page-size" columns={columns} data={pagedData} />
    );

    await user.selectOptions(screen.getByLabelText('Rows per page'), '50');

    expect(localStorage.getItem('datatable-page-size-test-page-size')).toBe('50');
  });
});
