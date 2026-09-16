import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@/test/utils/testUtils';
import type { Dog, Owner } from '@/types/dog-types';
import DogIdentityRail from '../DogIdentityRail';

/**
 * Captures the props the rail hands the menu. Deliberately does NOT re-render
 * the menu's item list: doing that made the mock a second implementation of
 * ThreeDotMenu's own ordering and `hideEdit` logic, which could drift from the
 * real one while these tests stayed green. Item order and labels belong to
 * `ThreeDotMenu.test.tsx`; what belongs HERE is the rail's contract -- which
 * handlers it supplies, and whether it suppresses Edit for this role.
 */
const menuProps: ThreeDotMenuProps[] = [];
vi.mock('@/components/common/ThreeDotMenu', () => ({
  default: (props: ThreeDotMenuProps) => {
    menuProps.push(props);
    return <div data-testid="three-dot-menu" />;
  },
}));

interface ThreeDotMenuProps {
  onView?: (() => void) | undefined;
  onEdit?: (() => void) | undefined;
  onEditPhoto?: (() => void) | undefined;
  onChangeStatus?: (() => void) | undefined;
  onDelete?: (() => void) | undefined;
  viewLabel?: string | undefined;
  editLabel?: string | undefined;
  changeStatusLabel?: string | undefined;
  hideEdit?: boolean | undefined;
  triggerClassName?: string | undefined;
}

/** The single menu the card rendered. */
function menu(): ThreeDotMenuProps {
  expect(menuProps).toHaveLength(1);
  return menuProps[0] as ThreeDotMenuProps;
}

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
      onStatusDialogOpen={() => {}}
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

beforeEach(() => {
  menuProps.length = 0;
});

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

  it('keeps secretary editing available without a placeholder verification action', () => {
    const onEditPanelOpen = vi.fn();
    renderRail(base, { role: 'secretary', onEditPanelOpen });
    expect(screen.getByText('Primary contact')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /verify for entry/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /enter a show/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Edit$/ }));
    expect(onEditPanelOpen).toHaveBeenCalledTimes(1);
  });

  it('links the owner and offers Enter a show for an exhibitor', () => {
    renderRail(base);
    expect(screen.getByRole('link', { name: 'Jane Smith' })).toHaveAttribute(
      'href',
      '/people/owner-1'
    );
    // MYK9-519: the browse hop carries the dog so the wizard can preselect it.
    expect(screen.getByRole('link', { name: /enter a show/i })).toHaveAttribute(
      'href',
      '/shows?dogId=dog-1'
    );
  });

  it('wears the same sex and status badges as the /dogs card', () => {
    renderRail({ ...base, status: 'retired' });
    expect(screen.getByText('Female')).toBeInTheDocument();
    expect(screen.getByText('Retired')).toBeInTheDocument();
  });

  // The badge is what announces the lifecycle state, so it has to be what
  // changes it: before this, status was reachable ONLY from the overflow menu
  // and the badge beside it was inert, which is where people looked first.
  it('opens the status dialog from the status badge itself', () => {
    const onStatusDialogOpen = vi.fn();
    renderRail({ ...base, status: 'retired' }, { onStatusDialogOpen });
    const badgeButton = screen.getByRole('button', { name: /retired.*change status/i });
    fireEvent.click(badgeButton);
    expect(onStatusDialogOpen).toHaveBeenCalledTimes(1);
  });

  // The badge carries `badgeVariants`, whose BASE ring is on `:focus` — written
  // for a <div> that can never match it. On a real <button> that means a ring
  // left behind after a mouse click, so the resolved class list must keep only
  // the `focus-visible` ring. Asserted on tailwind-merge's OUTPUT, which is the
  // thing that actually decides the conflict.
  it('rings the status badge on keyboard focus only, not after a mouse click', () => {
    renderRail({ ...base, status: 'retired' }, { onStatusDialogOpen: vi.fn() });
    const badge = screen.getByRole('button', { name: /retired.*change status/i });
    const classes = badge.className.split(/\s+/);
    expect(classes).toContain('focus:ring-0');
    expect(classes).toContain('focus-visible:ring-2');
    expect(classes).not.toContain('focus:ring-2');
  });

  // The ⋮ is the card's ONLY Delete affordance and its only menu route to
  // status, so the rail's contract with it is pinned per role. Asserted as the
  // prop object, which cannot drift from the real menu the way a mock item list
  // could: identity checks are also stronger than clicking a stand-in.
  it('hands the exhibitor menu Edit Dog plus photo, status and delete handlers', () => {
    const onEditPanelOpen = vi.fn();
    const onPhotoDialogOpen = vi.fn();
    const onStatusDialogOpen = vi.fn();
    const onDeleteDialogOpen = vi.fn();
    renderRail(base, {
      role: 'exhibitor',
      onEditPanelOpen,
      onPhotoDialogOpen,
      onStatusDialogOpen,
      onDeleteDialogOpen,
    });

    expect(menu().editLabel).toBe('Edit Dog');
    expect(menu().hideEdit).toBeUndefined();
    expect(menu().onEdit).toBe(onEditPanelOpen);
    expect(menu().onEditPhoto).toBe(onPhotoDialogOpen);
    expect(menu().onChangeStatus).toBe(onStatusDialogOpen);
    expect(menu().onDelete).toBe(onDeleteDialogOpen);
  });

  // The secretary already has a dedicated Edit button on the card, so the menu
  // suppresses its own Edit item — the `hideEdit` that the two per-role menus
  // carried before they were collapsed into one, and which the collapse dropped.
  it('suppresses the menu Edit item for a secretary, who has a dedicated button', () => {
    renderRail(base, { role: 'secretary' });
    expect(menu().hideEdit).toBe(true);
    expect(screen.getByRole('button', { name: /^Edit$/ })).toBeInTheDocument();
  });

  it.each([['exhibitor'], ['secretary']] as const)(
    'withholds the delete handler from a %s who cannot delete',
    role => {
      renderRail(base, { role, canDelete: false });
      expect(menu().onDelete).toBeUndefined();
    }
  );

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

  it('offers registration management for a registered dog', () => {
    const onManageRegistrations = vi.fn();
    renderRail(base, {
      registrations: [{ organization: 'AKC', registration_number: 'SR123' }],
      onManageRegistrations,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Manage registrations' }));
    expect(onManageRegistrations).toHaveBeenCalledOnce();
  });

  // Deleting the last registration and closing the panel must not unmount the
  // control focus returns to, so the trigger is not gated on the row count.
  it('keeps registration management for a dog with no registrations', () => {
    renderRail(base, { registrations: [], onManageRegistrations: vi.fn() });
    expect(screen.getByRole('button', { name: 'Manage registrations' })).toHaveAttribute(
      'aria-haspopup',
      'dialog'
    );
  });

  // React Query keeps `data` across a failed refetch, and dog.registrations is
  // often already populated — a rendered registry must survive both.
  it('keeps showing rows when the query is failing or still loading', () => {
    const rows = [{ organization: 'AKC', registration_number: 'SR123' }];
    const { unmount } = renderRail(base, { registrations: rows, registrationsFailed: true });
    expect(screen.getByText('SR123')).toBeInTheDocument();
    expect(screen.queryByText('Couldn\u2019t load registrations.')).toBeNull();
    unmount();

    renderRail(base, { registrations: rows, registrationsLoading: true });
    expect(screen.getByText('SR123')).toBeInTheDocument();
    expect(screen.queryByText('Loading registrations…')).toBeNull();
  });

  // A failed read must not wear the empty state's clothes: this rail is the only
  // registration summary on the page.
  it('reports a failed registrations read instead of "No registrations yet"', () => {
    const onRetryRegistrations = vi.fn();
    renderRail(base, { registrations: [], registrationsFailed: true, onRetryRegistrations });

    expect(screen.getByText('Couldn\u2019t load registrations.')).toBeInTheDocument();
    expect(screen.queryByText('No registrations yet.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetryRegistrations).toHaveBeenCalledTimes(1);
  });

  it('keeps the photo action at least 44px and named for assistive technology', () => {
    renderRail(base);
    expect(screen.getByRole('button', { name: 'Edit dog photo' })).toHaveClass('h-11', 'w-11');
  });

  it('keeps a populated photo and its edit action in the same compact panel', () => {
    renderRail({ ...base, imageUrl: 'https://example.com/maple.jpg' });
    expect(screen.getByRole('img', { name: "Maple's photo" })).toHaveAttribute(
      'src',
      'https://example.com/maple.jpg'
    );
    expect(screen.getByRole('button', { name: 'Edit dog photo' })).toBeInTheDocument();
  });
});
