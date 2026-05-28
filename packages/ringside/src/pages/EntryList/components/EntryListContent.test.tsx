/**
 * Smoke tests for `EntryListContent` (PR E2d-2b).
 *
 * Scope: empty-state render, grid render with N entries, DogCard slot
 * pass-through to SortableEntryCard, section badge plumbing. Drag
 * mechanics belong to dnd-kit. Uses vanilla vitest assertions (no
 * @testing-library/jest-dom in ringside).
 */

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { ComponentType } from 'react';
import type { Entry } from '../../../stores/entryStore';
import type { DogCardProps } from '../pageProps';
import { EntryListContent } from './EntryListContent';

const StubDogCard: ComponentType<DogCardProps> = ({ armband, sectionBadge }) => (
  <div data-testid="dog-card" data-armband={armband} data-section={sectionBadge ?? ''} />
);

const entry = (id: number, overrides: Partial<Entry> = {}): Entry =>
  ({
    id,
    classId: 100,
    armband: 40 + id,
    callName: `Dog${id}`,
    breed: 'Lab',
    handler: 'Alice',
    status: undefined,
    inRing: false,
    isScored: false,
    checkinStatus: undefined,
    section: null,
    element: 'Container',
    level: 'Novice',
    ...overrides,
  }) as unknown as Entry;

describe('EntryListContent', () => {
  it('renders the empty pending state with the right copy', () => {
    render(
      <EntryListContent
        entries={[]}
        activeTab="pending"
        isDragMode={false}
        hasPermission={() => true}
        onEntryClick={vi.fn()}
        onStatusClick={vi.fn()}
        onResetMenuClick={vi.fn()}
        onSelfCheckinDisabled={vi.fn()}
        sensors={[]}
        onDragStart={vi.fn()}
        onDragEnd={vi.fn() as () => Promise<void>}
        DogCard={StubDogCard}
      />
    );
    expect(screen.getByRole('heading', { name: /no pending entries/i })).not.toBeNull();
    expect(screen.getByText(/all entries have been scored/i)).not.toBeNull();
  });

  it('renders the empty completed state with the right copy', () => {
    render(
      <EntryListContent
        entries={[]}
        activeTab="completed"
        isDragMode={false}
        hasPermission={() => true}
        onEntryClick={vi.fn()}
        onStatusClick={vi.fn()}
        onResetMenuClick={vi.fn()}
        onSelfCheckinDisabled={vi.fn()}
        sensors={[]}
        onDragStart={vi.fn()}
        onDragEnd={vi.fn() as () => Promise<void>}
        DogCard={StubDogCard}
      />
    );
    expect(screen.getByText(/no entries have been scored yet/i)).not.toBeNull();
  });

  it('renders one DogCard per entry and passes through the DogCard slot', () => {
    render(
      <EntryListContent
        entries={[entry(1), entry(2), entry(3)]}
        activeTab="pending"
        isDragMode={false}
        hasPermission={() => true}
        onEntryClick={vi.fn()}
        onStatusClick={vi.fn()}
        onResetMenuClick={vi.fn()}
        onSelfCheckinDisabled={vi.fn()}
        sensors={[]}
        onDragStart={vi.fn()}
        onDragEnd={vi.fn() as () => Promise<void>}
        DogCard={StubDogCard}
      />
    );
    expect(screen.getAllByTestId('dog-card')).toHaveLength(3);
  });

  it('threads section badges through when showSectionBadges is true', () => {
    render(
      <EntryListContent
        entries={[entry(1, { section: 'A' }), entry(2, { section: 'B' })]}
        activeTab="pending"
        isDragMode={false}
        showSectionBadges={true}
        hasPermission={() => true}
        onEntryClick={vi.fn()}
        onStatusClick={vi.fn()}
        onResetMenuClick={vi.fn()}
        onSelfCheckinDisabled={vi.fn()}
        sensors={[]}
        onDragStart={vi.fn()}
        onDragEnd={vi.fn() as () => Promise<void>}
        DogCard={StubDogCard}
      />
    );
    const cards = screen.getAllByTestId('dog-card');
    expect(cards[0].getAttribute('data-section')).toBe('A');
    expect(cards[1].getAttribute('data-section')).toBe('B');
  });

  it('omits section badges when showSectionBadges is false (default)', () => {
    render(
      <EntryListContent
        entries={[entry(1, { section: 'A' })]}
        activeTab="pending"
        isDragMode={false}
        hasPermission={() => true}
        onEntryClick={vi.fn()}
        onStatusClick={vi.fn()}
        onResetMenuClick={vi.fn()}
        onSelfCheckinDisabled={vi.fn()}
        sensors={[]}
        onDragStart={vi.fn()}
        onDragEnd={vi.fn() as () => Promise<void>}
        DogCard={StubDogCard}
      />
    );
    expect(screen.getByTestId('dog-card').getAttribute('data-section')).toBe('');
  });
});
