/**
 * MYK9-2149: after submit, the receipt says what a form that held money still owes and links
 * to that entry form, where the payment is recorded; nothing owed says it was covered.
 */
import { render, screen } from '@/test/utils/testUtils';
import { describe, expect, it } from 'vitest';
import { DeskFormOutcomeNotice } from './DeskFormOutcomeNotice';

describe('DeskFormOutcomeNotice (MYK9-2149)', () => {
  it('says what is still owed and links to the entry form', () => {
    render(
      <DeskFormOutcomeNotice showId="show-1" outcome={{ formId: 'form-1', owedCents: 2000 }} />
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      'Still owed on this form: $20.00. Record it on the entry form when you take it.'
    );
    const link = screen.getByRole('link', { name: 'Open the entry form' });
    expect(link).toHaveAttribute('href', '/shows/show-1/entries?registration=form-1');
    // A new tab: leaving the wizard in this tab would drop it (MYK9-1973).
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('says nothing is owed, in neutral words, and still links to the entry form', () => {
    render(<DeskFormOutcomeNotice showId="show-1" outcome={{ formId: 'form-1', owedCents: 0 }} />);

    expect(screen.getByRole('status')).toHaveTextContent('Nothing is owed on this form now.');
    expect(screen.getByRole('link', { name: 'Open the entry form' })).toHaveAttribute(
      'target',
      '_blank'
    );
  });

  it('links to the entry form when what is owed could not be read', () => {
    render(
      <DeskFormOutcomeNotice showId="show-1" outcome={{ formId: 'form-1', owedCents: null }} />
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      /Could not check what is owed on this form/
    );
    expect(screen.getByRole('link', { name: 'Open the entry form' })).toBeInTheDocument();
  });
});
