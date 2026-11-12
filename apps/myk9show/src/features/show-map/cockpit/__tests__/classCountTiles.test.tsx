import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { render } from '@/test/utils/testUtils';
import { ClassCountTiles } from '../FocusedClassEntries';
import type { SecretaryCockpitClassEntry } from '../cockpitClassEntries';
import { queueFor } from './queueFixture';

const row = (
  armband: string,
  state: SecretaryCockpitClassEntry['state'],
  counted = true
): SecretaryCockpitClassEntry => ({
  nodeId: `entry:${armband}`,
  queue: queueFor(`entry:${armband}`, armband, state, counted),
  entryId: armband,
  checkInValue: 'no-status',
  deskEditable: true,
  lockedReason: null,
  armband,
  dogName: `Dog${armband}`,
  state,
  counted,
  notCheckedIn: false,
  place: null,
  result: null,
});

/** Rows as the table lists them: already in run order, which the shared queue sorts on. */
const inRunOrder = (rows: SecretaryCockpitClassEntry[]) =>
  rows.map((r, index) => ({ ...r, queue: { ...r.queue, exhibitorOrder: index + 1 } }));

const nextUp = () =>
  within(screen.getByRole('list', { name: 'Next up' }))
    .getAllByRole('listitem')
    .map(item => within(item).getByText(/^Armband /).textContent);

describe('ClassCountTiles in-ring tile', () => {
  it('shows the in-ring dog as an armband tile with its name', () => {
    render(<ClassCountTiles entries={[row('106', 'in-ring'), row('107', 'waiting')]} />);
    const tile = screen.getByTestId('in-ring-tile');
    expect(within(tile).getByText('106')).toBeInTheDocument();
    expect(within(tile).getByText('Dog106')).toBeInTheDocument();
    expect(tile).toHaveTextContent('Armband 106, Dog106');
    expect(within(tile).queryByText('Nobody in the ring')).toBeNull();
  });

  it('says nobody is in the ring when no row is', () => {
    render(<ClassCountTiles entries={[row('101', 'scored'), row('102', 'waiting')]} />);
    expect(screen.getByTestId('in-ring-tile')).toHaveTextContent('Nobody in the ring');
  });

  it('lists the next three waiting dogs in the given order, skipping others', () => {
    render(
      <ClassCountTiles
        entries={inRunOrder([
          row('101', 'scored'),
          row('102', 'in-ring'),
          row('110', 'waiting', false),
          row('105', 'waiting'),
          row('103', 'waiting'),
          row('104', 'pulled'),
          row('109', 'waiting'),
          row('108', 'waiting'),
        ])}
      />
    );
    expect(nextUp()).toEqual(['Armband 105, Dog105', 'Armband 103, Dog103', 'Armband 109, Dog109']);
  });

  it('lists fewer than three, or nothing, when fewer are waiting', () => {
    const { unmount } = render(<ClassCountTiles entries={[row('1', 'waiting')]} />);
    expect(nextUp()).toEqual(['Armband 1, Dog1']);
    unmount();
    render(<ClassCountTiles entries={[row('2', 'scored')]} />);
    expect(screen.queryByRole('list', { name: 'Next up' })).toBeNull();
  });

  it('renders nothing while the entries are unread', () => {
    render(<ClassCountTiles entries={[row('1', 'in-ring')]} unread />);
    expect(screen.queryByTestId('class-count-tiles')).toBeNull();
  });
});
