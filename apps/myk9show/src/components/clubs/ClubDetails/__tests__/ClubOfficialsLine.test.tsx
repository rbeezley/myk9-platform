/**
 * MYK9-860 — the club admin(s)/secretary(ies) line under the club name.
 * useClubOfficials.ts resolves each group to [] when RLS makes it unreadable
 * for the current viewer; this component's only job is to render that
 * correctly, including rendering nothing when neither group is readable.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { ClubOfficialsLine } from '../ClubOfficialsLine';

describe('ClubOfficialsLine', () => {
  it('shows the club admin by name', () => {
    render(<ClubOfficialsLine adminNames={['Jane Doe']} secretaryNames={[]} />);

    expect(screen.getByTestId('club-admin-names')).toHaveTextContent('Admin: Jane Doe');
    expect(screen.queryByTestId('club-secretary-names')).not.toBeInTheDocument();
  });

  it('pluralizes and shows multiple admins', () => {
    render(<ClubOfficialsLine adminNames={['Jane Doe', 'John Smith']} secretaryNames={[]} />);

    expect(screen.getByTestId('club-admin-names')).toHaveTextContent(
      'Admins: Jane Doe, John Smith'
    );
  });

  it('shows the club secretary by name', () => {
    render(<ClubOfficialsLine adminNames={[]} secretaryNames={['Pat Lee']} />);

    expect(screen.getByTestId('club-secretary-names')).toHaveTextContent('Secretary: Pat Lee');
    expect(screen.queryByTestId('club-admin-names')).not.toBeInTheDocument();
  });

  it('shows both admins and secretaries together', () => {
    render(<ClubOfficialsLine adminNames={['Jane Doe']} secretaryNames={['Pat Lee']} />);

    expect(screen.getByTestId('club-admin-names')).toHaveTextContent('Admin: Jane Doe');
    expect(screen.getByTestId('club-secretary-names')).toHaveTextContent('Secretary: Pat Lee');
  });

  it('renders nothing when neither group is readable for this viewer', () => {
    const { container } = render(<ClubOfficialsLine adminNames={[]} secretaryNames={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});
