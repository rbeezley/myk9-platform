import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@/test/utils/testUtils';
import type { Dog, Owner } from '@/types/dog-types';
import DogIdentityRail from '../DogIdentityRail';

vi.mock('@/components/common/ThreeDotMenu', () => ({
  default: () => <button type="button">More</button>,
}));

const owner: Owner = { id: 'owner-1', name: 'Jane Smith', email: 'jane@example.com', phone: '' };
const base = {
  id: 'dog-1',
  name: 'Maple',
  callName: 'Maple',
  breed: 'Golden Retriever',
  sex: 'female',
  ownerId: 'owner-1',
} satisfies Dog;

function renderRail(dog: Dog, props: Partial<React.ComponentProps<typeof DogIdentityRail>> = {}) {
  return render(
    <DogIdentityRail
      dog={dog}
      owner={owner}
      onEditPanelOpen={() => {}}
      onPhotoDialogOpen={() => {}}
      onDeleteDialogOpen={() => {}}
      {...props}
    />
  );
}

function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

describe('DogIdentityRail', () => {
  it('hides invalid measurements instead of showing NaN', () => {
    renderRail({ ...base, height: 'NaN', weight: 'NaN' });
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
    expect(screen.queryByText('Height / Weight')).not.toBeInTheDocument();
  });

  it('hides blank measurements instead of showing zero', () => {
    renderRail({ ...base, height: '', weight: '   ' });
    expect(screen.queryByText(/0"/)).not.toBeInTheDocument();
    expect(screen.queryByText('Height / Weight')).not.toBeInTheDocument();
  });

  it('joins height and weight on one row', () => {
    renderRail({ ...base, height: '20', weight: '38' });
    expect(screen.getByText('20" · 38 lbs')).toBeInTheDocument();
  });

  // The rail is the second call site of the shared `formatDogAge`: one date
  // of birth must not read two ways between the /dogs card and this page.
  it('renders the age beside the date of birth for an adult dog', () => {
    renderRail({ ...base, dateOfBirth: daysAgo(365 * 3 + 10) });
    expect(screen.getByText(/3 yrs old/)).toBeInTheDocument();
  });

  it('renders a puppy in months rather than as zero years', () => {
    renderRail({ ...base, dateOfBirth: daysAgo(100) });
    expect(screen.getByText(/3 mos old/)).toBeInTheDocument();
    expect(screen.queryByText(/0 yrs old/)).not.toBeInTheDocument();
  });

  it('hides the Born row when no date of birth is recorded', () => {
    renderRail(base);
    expect(screen.queryByText('Born')).not.toBeInTheDocument();
  });

  it('renders the registry table from live registrations, one row per registry', () => {
    renderRail(base, {
      registrations: [
        { organization: 'AKC', breed: 'Golden Retriever', registration_number: 'SR123' },
        { organization: 'UKC', breed: 'Golden Retriever', registration_number: 'P77' },
      ],
    });
    expect(screen.getByText('AKC')).toBeInTheDocument();
    expect(screen.getByText('SR123')).toBeInTheDocument();
    expect(screen.getByText('P77')).toBeInTheDocument();
    expect(screen.getByText('Golden Retriever')).toBeInTheDocument();
  });

  it('frames the owner as Primary contact with Verify for entry for a secretary', () => {
    renderRail(base, { role: 'secretary' });
    expect(screen.getByText('Primary contact')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /verify for entry/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /enter a show/i })).not.toBeInTheDocument();
  });

  it('links the owner and offers Enter a show for an exhibitor', () => {
    renderRail(base);
    expect(screen.getByRole('link', { name: 'Jane Smith' })).toHaveAttribute('href', '/people/owner-1');
    expect(screen.getByRole('link', { name: /enter a show/i })).toBeInTheDocument();
  });

  it('wears the same sex and status badges as the /dogs card', () => {
    renderRail({ ...base, status: 'retired' });
    expect(screen.getByText('Female')).toBeInTheDocument();
    expect(screen.getByText('Retired')).toBeInTheDocument();
  });

  // The old sidebar card held the ONLY ordinary path into the add panel;
  // RegistrationsSection's empty state deliberately carries no action, so
  // the rail must offer it whether or not the dog has registrations yet.
  it('offers Add registration even when the dog has none', () => {
    const onAddRegistration = vi.fn();
    renderRail(base, { onAddRegistration, registrations: [] });
    expect(screen.getByText('No registrations yet.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /add registration/i }));
    expect(onAddRegistration).toHaveBeenCalledTimes(1);
  });
});
