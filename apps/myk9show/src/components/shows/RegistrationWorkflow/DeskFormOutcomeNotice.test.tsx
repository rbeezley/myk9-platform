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
    expect(screen.getByRole('link', { name: 'Open the entry form' })).toHaveAttribute(
      'href',
      '/shows/show-1/entries?registration=form-1'
    );
  });

  it('says the money on the form covered it, with no link', () => {
    render(<DeskFormOutcomeNotice showId="show-1" outcome={{ formId: 'form-1', owedCents: 0 }} />);

    expect(screen.getByRole('status')).toHaveTextContent(
      'Covered by the money already on this form.'
    );
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('links to the entry form when what is owed could not be read', () => {
    render(
      <DeskFormOutcomeNotice showId="show-1" outcome={{ formId: 'form-1', owedCents: null }} />
    );

    expect(screen.getByRole('status')).toHaveTextContent(/could not read what is still owed/);
    expect(screen.getByRole('link', { name: 'Open the entry form' })).toBeInTheDocument();
  });
});
