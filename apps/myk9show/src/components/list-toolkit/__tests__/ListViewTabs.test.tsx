import { describe, it, expect, vi } from 'vitest';
import { useLocation } from 'react-router-dom';
import { render, screen } from '@/test/utils/testUtils';
import { ListViewTabs } from '../ListViewTabs';

function LocationProbe() {
  const location = useLocation();
  return <p data-testid="location">{location.pathname}</p>;
}

const VIEWS = [
  { id: 'all', label: 'All', count: 4812 },
  { id: 'never', label: 'Never signed in', count: 312 },
  { id: 'requests', label: 'Role requests', href: '/admin/role-requests' },
];

describe('ListViewTabs', () => {
  it('is a labelled "Show:" select with the count inside each option', async () => {
    const { user } = render(
      <ListViewTabs label="User views" activeId="all" onSelect={vi.fn()} views={VIEWS} />
    );
    expect(screen.getByText('Show:')).toBeInTheDocument();
    const select = screen.getByRole('combobox', { name: 'Show: User views' });
    expect(select).toHaveTextContent(`All (${(4812).toLocaleString()})`);

    await user.click(select);
    expect(
      await screen.findByRole('option', { name: 'Never signed in (312)' })
    ).toBeInTheDocument();
    // A view with no count shows its bare label.
    expect(screen.getByRole('option', { name: 'Role requests' })).toBeInTheDocument();
  });

  it('applies a picked view', async () => {
    const onSelect = vi.fn();
    const { user } = render(
      <ListViewTabs label="User views" activeId="all" onSelect={onSelect} views={VIEWS} />
    );
    await user.click(screen.getByRole('combobox', { name: 'Show: User views' }));
    await user.click(await screen.findByRole('option', { name: 'Never signed in (312)' }));
    expect(onSelect).toHaveBeenCalledWith('never');
  });

  it('reads "Custom" when the filters match no view', () => {
    render(<ListViewTabs label="User views" activeId={null} onSelect={vi.fn()} views={VIEWS} />);
    expect(screen.getByRole('combobox', { name: 'Show: User views' })).toHaveTextContent('Custom');
  });

  it('navigates to the page behind an href view instead of applying a filter', async () => {
    const onSelect = vi.fn();
    const { user } = render(
      <>
        <ListViewTabs label="User views" activeId="all" onSelect={onSelect} views={VIEWS} />
        <LocationProbe />
      </>
    );
    await user.click(screen.getByRole('combobox', { name: 'Show: User views' }));
    await user.click(await screen.findByRole('option', { name: 'Role requests' }));

    expect(screen.getByTestId('location')).toHaveTextContent('/admin/role-requests');
    expect(onSelect).not.toHaveBeenCalled();
  });
});
