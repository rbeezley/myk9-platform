// @vitest-environment node
// MYK9-2486, Codex review of #4463: the receipt an exhibitor gets after paying by card is built
// here, not in send-confirmation-email. Its show query did not read `location`, the one column
// the show wizard writes the street address to, so paid receipts still said "Tulsa, Oklahoma".
//
// index.ts reads Deno.env at module scope and cannot be imported under plain vitest, so the
// query is pinned against the file text (the source-text convention, #624), and the render is
// tested through the same two functions the webhook calls.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { formatVenueLines } from '../_shared/exhibitorEmailDetails.ts';
import {
  renderStripeEntryConfirmationEmail,
  type StripeEntryConfirmationEmailData,
} from './entryConfirmationEmail.ts';

const webhookSource = readFileSync(resolve(__dirname, 'index.ts'), 'utf8');

/** Every column `formatVenueLines` reads. A show query that feeds it must select them all. */
const VENUE_COLUMNS = ['location', 'venue_name', 'address', 'city', 'state', 'zip_code'];

/** The text an exhibitor reads: no tags, no attribute values (an aria-label is not visible). */
function visibleText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

describe('the paid-cart receipt reads the show address the wizard saved', () => {
  it("selects every column the venue lines are built from in the receipt's show query", () => {
    expect(webhookSource).toContain('formatVenueLines(show)');
    const showQuery = /\.from\('shows'\)\s*\.select\('([^']*venue_name[^']*)'\)/.exec(
      webhookSource
    );

    expect(showQuery, 'the receipt show query was not found').not.toBeNull();
    const selected = (showQuery?.[1] ?? '').split(',').map(column => column.trim());
    for (const column of VENUE_COLUMNS) expect(selected).toContain(column);
  });

  it('prints the typed street address on the receipt', () => {
    // The show as production holds it: the typed address, a city and state, nothing else.
    const showLocation = formatVenueLines({
      location: '100 Dog Show Lane, Tulsa, OK 74101',
      venue_name: null,
      address: null,
      city: 'Tulsa',
      state: 'Oklahoma',
      zip_code: null,
    });
    const data: StripeEntryConfirmationEmailData = {
      exhibitorName: 'Ada',
      showName: 'Fall Trial',
      showDate: 'October 3, 2026',
      showLocation: showLocation ?? undefined,
      entries: [{ dogName: 'Rocket', className: 'Novice', classLevel: 'A', entryFee: 2500 }],
      subtotal: 2500,
      serviceFee: 125,
      total: 2625,
      confirmationNumber: 'CONF-1234',
      entriesUrl: 'https://myk9show.com/exhibitor/entries',
    };

    expect(visibleText(renderStripeEntryConfirmationEmail(data))).toContain(
      '100 Dog Show Lane, Tulsa, OK 74101'
    );
  });
});
