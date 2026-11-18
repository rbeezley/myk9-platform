import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { makePaymentResolution } from '@/test/utils/paymentResolution';
import { CardPausedNotice } from './CardPausedNotice';

const PAUSED = "Card payment is paused for this show. The club's bank account needs attention.";

describe('CardPausedNotice (MYK9-2166)', () => {
  it('tells her at the start, naming check and cash when the show takes both', () => {
    render(
      <CardPausedNotice
        resolution={makePaymentResolution({ cardPaused: true })}
        stepId="dog-selection"
      />
    );
    expect(screen.getByRole('alert')).toHaveTextContent(`${PAUSED} Choose check or cash instead.`);
  });

  it('names only the method the show takes', () => {
    render(
      <CardPausedNotice
        resolution={makePaymentResolution({
          cardPaused: true,
          acceptedMethods: { check: false, cash: true },
        })}
        stepId="class-selection"
      />
    );
    expect(screen.getByRole('alert')).toHaveTextContent(`${PAUSED} Choose cash instead.`);
  });

  it('says plainly to contact the secretary when the show takes neither', () => {
    render(
      <CardPausedNotice
        resolution={makePaymentResolution({
          cardPaused: true,
          acceptedMethods: { check: false, cash: false },
        })}
        stepId="dog-selection"
      />
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      `${PAUSED} Payment isn't available for this show right now. Please contact the show secretary.`
    );
  });

  it('shows nothing when payouts are on, unknown or for staff (cardPaused is false)', () => {
    render(
      <CardPausedNotice
        resolution={makePaymentResolution({ cardPaused: false })}
        stepId="dog-selection"
      />
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('leaves the payment step and the receipt to say it themselves', () => {
    for (const stepId of ['payment', 'confirmation']) {
      const { unmount } = render(
        <CardPausedNotice
          resolution={makePaymentResolution({ cardPaused: true })}
          stepId={stepId}
        />
      );
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      unmount();
    }
  });
});
