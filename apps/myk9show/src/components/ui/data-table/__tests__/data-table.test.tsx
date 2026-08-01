import { screen, within } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { type ColumnDef } from '@tanstack/react-table';
import { DataTable } from '../index';

interface TestRow {
  id: string;
  name: string;
  age: number;
  email: string;
}

const testData: TestRow[] = [
  { id: '1', name: 'Alice', age: 30, email: 'alice@test.com' },
  { id: '2', name: 'Bob', age: 25, email: 'bob@test.com' },
  { id: '3', name: 'Charlie', age: 35, email: 'charlie@test.com' },
];

const columns: ColumnDef<TestRow>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'age', header: 'Age' },
  { accessorKey: 'email', header: 'Email' },
];

describe('DataTable', () => {
  it('renders column headers', () => {
    render(<DataTable columns={columns} data={testData} />);
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Age')).toBeInTheDocument();
    expect(screen.getByText('Email')).toBeInTheDocument();
  });

  it('renders row data', () => {
    render(<DataTable columns={columns} data={testData} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Charlie')).toBeInTheDocument();
  });

  it('shows empty state when data is empty', () => {
    render(<DataTable columns={columns} data={[]} />);
    expect(screen.getByText('No results found.')).toBeInTheDocument();
  });

  it('shows custom empty state', () => {
    render(<DataTable columns={columns} data={[]} emptyState={<div>Custom empty</div>} />);
    expect(screen.getByText('Custom empty')).toBeInTheDocument();
  });

  it('sorts by column on header click', async () => {
    const { user } = render(<DataTable columns={columns} data={testData} />);
    const nameHeader = screen.getByRole('button', { name: /name/i });
    await user.click(nameHeader);
    const rows = screen.getAllByRole('row');
    expect(within(rows[1]).getByText('Alice')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Bob')).toBeInTheDocument();
    expect(within(rows[3]).getByText('Charlie')).toBeInTheDocument();
  });

  it('sorts descending on second header click', async () => {
    const { user } = render(<DataTable columns={columns} data={testData} />);
    const nameHeader = screen.getByRole('button', { name: /name/i });
    await user.click(nameHeader);
    await user.click(nameHeader);
    const rows = screen.getAllByRole('row');
    expect(within(rows[1]).getByText('Charlie')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Bob')).toBeInTheDocument();
    expect(within(rows[3]).getByText('Alice')).toBeInTheDocument();
  });

  it('calls onRowClick when a row is clicked', async () => {
    const handleClick = vi.fn();
    const { user } = render(
      <DataTable columns={columns} data={testData} onRowClick={handleClick} />
    );
    await user.click(screen.getByText('Alice'));
    expect(handleClick).toHaveBeenCalledWith(
      expect.objectContaining({ id: '1', name: 'Alice' }),
      expect.anything()
    );
  });

  it('calls onRowClick inside a focusable scroll region', async () => {
    // The interactive-element guard used to scan the whole ancestor chain, so a
    // table wrapped in the standard `role="region" tabIndex={0}` scroll area
    // matched that wrapper and swallowed every row click (/admin/users shipped
    // this way). The guard only means "did the click land on something
    // interactive *inside the row*".
    const handleClick = vi.fn();
    const { user } = render(
      <div role="region" tabIndex={0} aria-label="Table scroll area">
        <DataTable columns={columns} data={testData} onRowClick={handleClick} />
      </div>
    );
    await user.click(screen.getByText('Alice'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('still ignores clicks on interactive cells inside the row', async () => {
    const handleClick = vi.fn();
    const withButton = [
      ...columns,
      {
        id: 'action',
        cell: () => <button type="button">Act</button>,
      },
    ];
    const { user } = render(
      <DataTable columns={withButton} data={testData} onRowClick={handleClick} />
    );
    await user.click(screen.getAllByRole('button', { name: 'Act' })[0]!);
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('applies cursor-pointer class when onRowClick is set', () => {
    render(<DataTable columns={columns} data={testData} onRowClick={() => {}} />);
    const row = screen.getByText('Alice').closest('tr');
    expect(row).toHaveClass('cursor-pointer');
  });

  it('shows loading skeleton when loading is true', () => {
    render(<DataTable columns={columns} data={[]} loading />);
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });
});
