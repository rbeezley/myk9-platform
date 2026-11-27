import { describe, expect, it } from 'vitest';

import { EMAIL_STYLES } from './email-style-registry';
import { buildConfirmationEmailData } from './entryConfirmations';
import { entry, show } from './entryConfirmationRunHarness';
import { registryEmailLanguage } from './registryLanguage';
import { renderConfirmationEmail } from './renderConfirmationEmail';

// MYK9-2486: the acceptance email printed "Tulsa, Oklahoma" for a show whose address is
// "100 Dog Show Lane, Tulsa, OK 74101". The show wizard saves the address in `location` and
// fills none of the separate address columns, which were the only ones the email read.

/** The show as production holds it: the typed address, a city and state, nothing else. */
const wizardShow = (style: string, location: string | null) =>
  show({
    style,
    location,
    venue_name: null,
    address: null,
    city: 'Tulsa',
    state: 'Oklahoma',
    zip_code: null,
  });

function renderFor(style: string, location: string | null): string {
  const theShow = wizardShow(style, location);
  const data = buildConfirmationEmailData({
    show: theShow,
    entries: [entry()],
    recipient: null,
    judgeByClass: new Map(),
    confirmationNumber: 'R-1',
    siteUrl: null,
  });
  return renderConfirmationEmail(data, theShow, registryEmailLanguage('AKC'));
}

describe.each(EMAIL_STYLES)('venue in the %s confirmation', style => {
  it('prints the street address the secretary typed', () => {
    const html = renderFor(style, '100 Dog Show Lane, Tulsa, OK 74101');

    expect(html).toContain('100 Dog Show Lane, Tulsa, OK 74101');
  });

  it('prints the city and state when the show has no street address', () => {
    const html = renderFor(style, null);

    expect(html).toContain('Tulsa, Oklahoma');
    expect(html).not.toContain('Dog Show Lane');
  });
});
