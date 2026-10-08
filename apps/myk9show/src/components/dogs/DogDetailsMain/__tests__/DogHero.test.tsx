import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@/test/utils/testUtils';
import type { Dog } from '@/types/dog-types';
import DogHero from '../DogHero';

/**
 * The dog's identity moved out of the rail into the shared DetailHero
 * (MYK9-930, audit H9). These are the identity assertions the rail used to
 * carry: badges, the status badge as a control, the photo action. Its ⋮ menu
 * is gone: the page's actions live in the header Actions menu (CRUD standard
 * decision 6), registered by `DogDetailsMain`.
 */
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
    <DogHero dog={dog} onPhotoDialogOpen={() => {}} onStatusDialogOpen={() => {}} {...props} />
  );
}

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

  it('renders no ⋮ menu: the photo and status controls on the card are what stay', () => {
    const onPhotoDialogOpen = vi.fn();
    const onStatusDialogOpen = vi.fn();
    renderHero({ ...base, status: 'retired' }, { onPhotoDialogOpen, onStatusDialogOpen });

    expect(screen.queryByRole('button', { name: /more actions/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit dog photo' }));
    fireEvent.click(screen.getByRole('button', { name: /retired.*change status/i }));
    expect(onPhotoDialogOpen).toHaveBeenCalledTimes(1);
    expect(onStatusDialogOpen).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: /^edit( dog)?$/i })).not.toBeInTheDocument();
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
