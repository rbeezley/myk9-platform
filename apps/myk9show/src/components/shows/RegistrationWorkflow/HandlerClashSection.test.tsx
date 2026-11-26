import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fromPartial } from '@total-typescript/shoehorn';
import { render, screen, userEvent } from '@/test/utils/testUtils';
import { HandlerClashSection } from './HandlerClashSection';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { useClassStoreCompat } from '@/hooks/useClassStoreCompat';
import type { ClassSelectionData, HandlerInfo } from '@/types/show-registration-types';

vi.mock('@/hooks/useDogStoreCompat', () => ({ useDogStoreCompat: vi.fn() }));
vi.mock('@/hooks/useClassStoreCompat', () => ({ useClassStoreCompat: vi.fn() }));

const owner: HandlerInfo = { handlerId: 'o1', handlerName: 'Pat Owner', isOwner: true };

const dogs = [
  { id: 'willow', callName: 'Willow', name: 'Willow', ownerId: 'o1', ownerName: 'Pat Owner' },
  { id: 'scout', callName: 'Scout', name: 'Scout', ownerId: 'o1', ownerName: 'Pat Owner' },
];

const classRows = [
  { id: 'cNovA', trialId: 't1', element: 'Container', level: 'Novice', section: 'A' },
  { id: 'cNovB', trialId: 't1', element: 'Container', level: 'Novice', section: 'B' },
  { id: 'iNovA', trialId: 't1', element: 'Interior', level: 'Novice', section: 'A' },
];

const pick = (dogId: string, classId: string): ClassSelectionData => ({
  dogId,
  trialId: 't1',
  selectedClasses: [{ classId }],
});

interface HarnessProps {
  selections: ClassSelectionData[];
  selectedDogs?: string[];
  existing?: { dogId: string; classId: string }[];
  onPending: (count: number) => void;
  onAssign: (next: Record<string, HandlerInfo>) => void;
  staff?: boolean;
}

function Harness({
  selections,
  selectedDogs = ['willow', 'scout'],
  existing = [],
  onPending,
  onAssign,
  staff,
}: HarnessProps) {
  const [assignments, setAssignments] = useState<Record<string, HandlerInfo>>(() =>
    Object.fromEntries(
      selections.flatMap(s => s.selectedClasses.map(c => [`${s.dogId}|${c.classId}`, owner]))
    )
  );
  const [deferred, setDeferred] = useState<string[]>([]);
  return (
    <HandlerClashSection
      selectedDogs={selectedDogs}
      classSelections={selections}
      existingEntries={existing}
      handlerAssignments={assignments}
      onHandlerAssignmentChange={next => {
        onAssign(next);
        setAssignments(next);
      }}
      deferredPairKeys={deferred}
      onDeferredChange={setDeferred}
      onPendingChange={onPending}
      staff={staff}
    />
  );
}

describe('HandlerClashSection (MYK9-2021)', () => {
  beforeEach(() => {
    vi.mocked(useDogStoreCompat).mockReturnValue(fromPartial({ dogs }));
    vi.mocked(useClassStoreCompat).mockReturnValue(fromPartial({ classes: classRows }));
  });

  it('asks nothing when the two dogs are in different elements', () => {
    const onPending = vi.fn();
    render(
      <Harness
        selections={[pick('willow', 'cNovA'), pick('scout', 'iNovA')]}
        onPending={onPending}
        onAssign={vi.fn()}
      />
    );
    expect(screen.queryByTestId('handler-clashes')).toBeNull();
    expect(screen.queryByText(/Handlers assigned/)).toBeNull();
    expect(onPending).toHaveBeenLastCalledWith(0);
  });

  it('names the dogs and the class, and keeps Continue blocked until answered', () => {
    const onPending = vi.fn();
    render(
      <Harness
        selections={[pick('willow', 'cNovA'), pick('scout', 'cNovA')]}
        onPending={onPending}
        onAssign={vi.fn()}
      />
    );
    expect(
      screen.getByText(
        "You can't handle both Willow and Scout in Container Novice A. Who will handle Scout?"
      )
    ).toBeInTheDocument();
    expect(onPending).toHaveBeenLastCalledWith(1);
  });

  it('names the owner, not "you", when a secretary keys the entry', () => {
    render(
      <Harness
        staff
        selections={[pick('willow', 'cNovA'), pick('scout', 'cNovA')]}
        onPending={vi.fn()}
        onAssign={vi.fn()}
      />
    );
    expect(
      screen.getByText(
        "Pat Owner can't handle both Willow and Scout in Container Novice A. Who handles Scout?"
      )
    ).toBeInTheDocument();
  });

  it('treats Novice A and Novice B as one class', () => {
    render(
      <Harness
        selections={[pick('willow', 'cNovA'), pick('scout', 'cNovB')]}
        onPending={vi.fn()}
        onAssign={vi.fn()}
      />
    );
    expect(screen.getByText(/in Container Novice\. Who will handle Scout\?/)).toBeInTheDocument();
  });

  it('writes a typed name as the second dog handler and answers the question', async () => {
    const onPending = vi.fn();
    const onAssign = vi.fn();
    render(
      <Harness
        selections={[pick('willow', 'cNovA'), pick('scout', 'cNovA')]}
        onPending={onPending}
        onAssign={onAssign}
      />
    );
    await userEvent.type(screen.getByRole('textbox'), 'Sam');
    expect(onAssign).toHaveBeenLastCalledWith(
      expect.objectContaining({
        'scout|cNovA': { handlerId: '', handlerName: 'Sam', isOwner: false },
        'willow|cNovA': expect.objectContaining({ isOwner: true }),
      })
    );
    expect(onPending).toHaveBeenLastCalledWith(0);
  });

  it('lets her decide at the show, leaving the owner as handler', async () => {
    const onPending = vi.fn();
    const onAssign = vi.fn();
    render(
      <Harness
        selections={[pick('willow', 'cNovA'), pick('scout', 'cNovA')]}
        onPending={onPending}
        onAssign={onAssign}
      />
    );
    const button = screen.getByRole('checkbox', { name: "I'll decide at the show" });
    await userEvent.click(button);
    expect(onAssign).toHaveBeenLastCalledWith(
      expect.objectContaining({
        'scout|cNovA': { handlerId: 'o1', handlerName: 'Pat Owner', isOwner: true },
      })
    );
    expect(button).toBeChecked();
    expect(onPending).toHaveBeenLastCalledWith(0);
  });

  it('catches a dog entered now when her other dog is already entered in that class', () => {
    render(
      <Harness
        selectedDogs={['scout']}
        selections={[pick('scout', 'cNovB')]}
        existing={[{ dogId: 'willow', classId: 'cNovA' }]}
        onPending={vi.fn()}
        onAssign={vi.fn()}
      />
    );
    expect(screen.getByText(/You can't handle both Willow and Scout/)).toBeInTheDocument();
  });
});
