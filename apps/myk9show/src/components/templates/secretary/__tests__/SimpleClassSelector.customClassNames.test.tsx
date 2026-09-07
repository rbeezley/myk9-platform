/**
 * MYK9-389 (residual) — a class cloned into the show wizard under a custom name
 * ("Interior Advanced Preliminary") rendered a card whose VISIBLE content was
 * `Advanced`, byte-identical to the template's own "Interior Advanced" card. The
 * two differed only in their aria-label, which is precisely why the clash was
 * invisible to the sighted secretary who had to choose one to remove.
 *
 * These assertions therefore read the card's RENDERED TEXT. Asserting the
 * accessible name would pass on the broken build — it was already correct.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';

import { SimpleClassSelector } from '../SimpleClassSelector';
import type { ClassDefinition, ClassTemplate } from '@/types/template.types';

const CONTAINER_NOVICE_A: ClassDefinition = {
  element: 'Container',
  level: 'Novice',
  section: 'A',
  className: 'Container Novice A',
  displayOrder: 1,
};

const INTERIOR_ADVANCED: ClassDefinition = {
  element: 'Interior',
  level: 'Advanced',
  className: 'Interior Advanced',
  displayOrder: 2,
};

/** The cloned, renamed class the wizard retains outside the template catalog. */
const INTERIOR_ADVANCED_PRELIMINARY: ClassDefinition = {
  element: 'Interior',
  level: 'Advanced',
  className: 'Interior Advanced Preliminary',
  displayOrder: 3,
};

const TEMPLATE = {
  id: 'tpl-1',
  templateName: 'AKC Scent Work',
  classDefinitions: [CONTAINER_NOVICE_A, INTERIOR_ADVANCED, INTERIOR_ADVANCED_PRELIMINARY],
} as unknown as ClassTemplate;

function renderSelector(props: Record<string, unknown> = {}) {
  return render(
    <SimpleClassSelector
      template={TEMPLATE}
      selectedClasses={[INTERIOR_ADVANCED, INTERIOR_ADVANCED_PRELIMINARY]}
      onSelectionChange={vi.fn()}
      availableJudges={[]}
      judgeAssignments={{}}
      {...props}
    />
  );
}

/** The card element for a class, located by the accessible name it already had. */
function card(accessibleName: string): HTMLElement {
  return screen.getByRole('checkbox', { name: accessibleName });
}

/** What a sighted user can actually read on the card, whitespace-normalized. */
function visibleText(element: HTMLElement): string {
  return (element.textContent ?? '').replace(/\s+/gu, ' ').trim();
}

describe('SimpleClassSelector custom class names', () => {
  it('spells out both names when two cards would otherwise read the same', () => {
    renderSelector();

    const templateCard = card('Deselect Interior Advanced');
    const clonedCard = card('Deselect Interior Advanced Preliminary');

    expect(visibleText(templateCard)).toContain('Interior Advanced');
    expect(visibleText(clonedCard)).toContain('Interior Advanced Preliminary');
    // The defect itself: identical rendered text on two different classes.
    expect(visibleText(templateCard)).not.toBe(visibleText(clonedCard));
  });

  it('leaves a class with a unique visible label reading just its level', () => {
    // Standard template cards must not grow a redundant second line.
    renderSelector();

    // The level and the section chip are adjacent elements with no text node
    // between them, so the concatenated content is "NoviceA" — the point is that
    // nothing else was added, i.e. no full-name line.
    expect(visibleText(card('Select Container Novice A'))).toBe('NoviceA');
  });

  it('keeps the full name visible when a search hides the look-alike card', async () => {
    // Filtering removes the twin, but the surviving card must not fall back to
    // the bare level that started this — the ambiguity is a property of the
    // catalog, not of the current filter.
    renderSelector();

    await userEvent.type(screen.getByPlaceholderText('Search classes...'), 'Prelim');

    expect(screen.queryByRole('checkbox', { name: 'Deselect Interior Advanced' })).toBeNull();
    expect(visibleText(card('Deselect Interior Advanced Preliminary'))).toContain(
      'Interior Advanced Preliminary'
    );
  });

  it('spells out a cloned class that has displaced its template twin', () => {
    // The wizard's merge keys on element|level|section, so the retained custom class
    // replaces "Interior Advanced" outright: no ambiguity, and the card would read a
    // bare `Advanced` — the standard class's own label on a class that is not it.
    const displaced = {
      id: 'tpl-1',
      templateName: 'AKC Scent Work',
      classDefinitions: [CONTAINER_NOVICE_A, INTERIOR_ADVANCED_PRELIMINARY],
    } as unknown as ClassTemplate;

    render(
      <SimpleClassSelector
        template={displaced}
        customClassNames={['Interior Advanced Preliminary']}
        selectedClasses={[INTERIOR_ADVANCED_PRELIMINARY]}
        onSelectionChange={vi.fn()}
        availableJudges={[]}
        judgeAssignments={{}}
      />
    );

    expect(visibleText(card('Deselect Interior Advanced Preliminary'))).toContain(
      'Interior Advanced Preliminary'
    );
    // The standard class beside it is still left alone.
    expect(visibleText(card('Select Container Novice A'))).toBe('NoviceA');
  });

  it('still removes the cloned class from the keyboard', async () => {
    const onSelectionChange = vi.fn();
    renderSelector({ onSelectionChange });

    const clonedCard = card('Deselect Interior Advanced Preliminary');
    clonedCard.focus();
    await userEvent.keyboard('{Enter}');

    expect(onSelectionChange).toHaveBeenCalledTimes(1);
    expect(onSelectionChange.mock.calls[0][0]).toEqual([INTERIOR_ADVANCED]);
  });
});
