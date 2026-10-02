import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@/test/utils/testUtils';
import type { Dog } from '@/types/dog-types';
import DogHero from '../DogHero';

/**
 * The dog's identity moved out of the rail into the shared DetailHero
 * (MYK9-930, audit H9). These are the identity assertions the rail used to
 * carry: badges, the status badge as a control, the photo action, the menu.
 *
 * Captures the props the hero hands the menu. Deliberately does NOT re-render
 * the menu's item list: item order and labels belong to `ThreeDotMenu.test.tsx`.
 */
const menuProps: ThreeDotMenuProps[] = [];
vi.mock('@/components/common/ThreeDotMenu', () => ({
  default: (props: ThreeDotMenuProps) => {
    menuProps.push(props);
    return <div data-testid="three-dot-menu" />;
  },
}));

interface ThreeDotMenuProps {
  onEdit?: (() => void) | undefined;
  onEditPhoto?: (() => void) | undefined;
  onChangeStatus?: (() => void) | undefined;
  onDelete?: (() => void) | undefined;
}

function menu(): ThreeDotMenuProps {
  expect(menuProps).toHaveLength(1);
  return menuProps[0] as ThreeDotMenuProps;
}

const base = {
  id: 'dog-1',
  name: 'Maple',
  callName: 'Maple',
  breed: 'Golden Retriever',
  sex: 'female',
  ownerId: 'owner-1',
} satisfies Dog;

function renderHero(dog: Dog, props: Partial<React.ComponentProps<typeof DogHero>> = {}) {
  return render(
    <DogHero
      dog={dog}
      onPhotoDialogOpen={() => {}}
      onDeleteDialogOpen={() => {}}
      onStatusDialogOpen={() => {}}
      {...props}
    />
  );
}

beforeEach(() => {
  menuProps.length = 0;
});

describe('DogHero (MYK9-930)', () => {
  it('owns the page h1 with the call name, and shows the registered name beneath it', () => {
    renderHero({
      ...base,
      registrations: [
        {
          id: 'r1',
          organization: 'AKC',
          registeredName: 'CH Maple Of The Meadow',
          breed: 'Golden Retriever',
          registrationNumber: 'SR1',
          status: 'Active',
        },
      ],
    });
    expect(screen.getByRole('heading', { level: 1, name: 'Maple' })).toBeInTheDocument();
    expect(screen.getByText('CH Maple Of The Meadow')).toBeInTheDocument();
  });

  it('makes the heading the route-entry focus target when given a ref', () => {
    const ref = { current: null as HTMLHeadingElement | null };
    renderHero(base, { headingRef: ref });
    expect(ref.current).toBe(screen.getByRole('heading', { name: 'Maple' }));
  });

  it('wears the same sex and status badges as the /dogs card', () => {
    renderHero({ ...base, status: 'retired' });
    expect(screen.getByText('Female')).toBeInTheDocument();
    expect(screen.getByText('Retired')).toBeInTheDocument();
  });

  // The badge announces the lifecycle state, so it is also the control that
  // changes it.
  it('opens the status dialog from the status badge itself', () => {
    const onStatusDialogOpen = vi.fn();
    renderHero({ ...base, status: 'retired' }, { onStatusDialogOpen });
    fireEvent.click(screen.getByRole('button', { name: /retired.*change status/i }));
    expect(onStatusDialogOpen).toHaveBeenCalledTimes(1);
  });

  it('rings the status badge on keyboard focus only, not after a mouse click', () => {
    renderHero({ ...base, status: 'retired' });
    const classes = screen
      .getByRole('button', { name: /retired.*change status/i })
      .className.split(/\s+/);
    expect(classes).toContain('focus:ring-0');
    expect(classes).toContain('focus-visible:ring-2');
    expect(classes).not.toContain('focus:ring-2');
  });

  it('shows the date of passing beside a deceased status', () => {
    renderHero({ ...base, status: 'deceased', deceasedDate: '2025-03-04' });
    expect(screen.getByRole('button', { name: /deceased/i })).toHaveTextContent('2025');
  });

  it('hands the menu photo, status and delete handlers, and no Edit (MYK9-928)', () => {
    const onPhotoDialogOpen = vi.fn();
    const onStatusDialogOpen = vi.fn();
    const onDeleteDialogOpen = vi.fn();
    renderHero(base, { onPhotoDialogOpen, onStatusDialogOpen, onDeleteDialogOpen });

    expect(menu().onEdit).toBeUndefined();
    expect(menu().onEditPhoto).toBe(onPhotoDialogOpen);
    expect(menu().onChangeStatus).toBe(onStatusDialogOpen);
    expect(menu().onDelete).toBe(onDeleteDialogOpen);
    expect(screen.queryByRole('button', { name: /^edit( dog)?$/i })).not.toBeInTheDocument();
  });

  it('withholds the delete handler from a viewer who cannot delete', () => {
    renderHero(base, { canDelete: false });
    expect(menu().onDelete).toBeUndefined();
  });

  it('keeps the status badge button a 44px tap target', () => {
    renderHero({ ...base, status: 'retired' });
    expect(screen.getByRole('button', { name: /retired.*change status/i })).toHaveClass(
      'min-h-11',
      'min-w-11'
    );
  });

  it('keeps the photo action at least 44px and named for assistive technology', () => {
    renderHero(base);
    expect(screen.getByRole('button', { name: 'Edit dog photo' })).toHaveClass('h-11', 'w-11');
  });

  it('shows a populated photo with its edit action', () => {
    renderHero({ ...base, imageUrl: 'https://example.com/maple.jpg' });
    expect(screen.getByRole('img', { name: "Maple's photo" })).toHaveAttribute(
      'src',
      'https://example.com/maple.jpg'
    );
    expect(screen.getByRole('button', { name: 'Edit dog photo' })).toBeInTheDocument();
  });
});
