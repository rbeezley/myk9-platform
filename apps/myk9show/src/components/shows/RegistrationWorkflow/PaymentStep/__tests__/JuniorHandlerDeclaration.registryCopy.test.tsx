/**
 * MYK9-879 (Codex P2): the control tells the exhibitor the date their registry
 * measures "under 18" on, without collecting a birth date. AKC Scent Work: the day
 * of the trial. UKC Nosework (Ch.1 Sec.3): as of January 1 of the competition year.
 * ASCA has no junior tier and the control is hidden for it.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { JuniorHandlerDeclarationControl } from '../JuniorHandlerDeclaration';
import { juniorMeasuringDateText } from '../juniorMeasuringDate';

const declaration = { canDeclare: true, dogIds: new Set<string>(), onChange: vi.fn() };
const dogs = [{ id: 'dog-1', name: 'Rocket' }];

function helpText(organization: string | undefined) {
  render(
    <JuniorHandlerDeclarationControl
      fee={15}
      dogs={dogs}
      declaration={declaration}
      organization={organization}
    />
  );
  return screen.getByText(/the person showing it is under 18/i).textContent ?? '';
}

describe('junior handler declaration copy per registry', () => {
  it('AKC: under 18 on the day of the trial', () => {
    const text = helpText('AKC');
    expect(text).toMatch(/under 18 on the day of the trial/);
    expect(text).not.toMatch(/January 1/);
  });

  it('UKC: under 18 as of January 1 of the competition year, not the trial day', () => {
    const text = helpText('UKC');
    expect(text).toMatch(/as of January 1 of the competition year/);
    expect(text).not.toMatch(/day of the trial/);
  });

  it('keeps saying the question is about the handler, and collects no birth date', () => {
    const text = helpText('UKC');
    expect(text).toMatch(/about the handler, not the owner/);
    expect(screen.queryByLabelText(/birth|date of birth|dob/i)).toBeNull();
    expect(screen.queryByPlaceholderText(/birth|mm\/dd/i)).toBeNull();
  });

  it('falls back to the AKC day-of-trial wording for an unknown organization', () => {
    expect(juniorMeasuringDateText(undefined)).toBe('on the day of the trial');
    expect(juniorMeasuringDateText('')).toBe('on the day of the trial');
  });
});
