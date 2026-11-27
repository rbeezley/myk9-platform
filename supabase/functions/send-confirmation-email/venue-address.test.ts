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

/**
 * The text an exhibitor reads: tags and their attributes removed. The directions link repeats
 * the address in its `aria-label`, so a search of the raw HTML passes even when no template
 * prints the venue (Codex review of #4463).
 */
function visibleText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

describe.each(EMAIL_STYLES)('venue in the %s confirmation', style => {
  it('prints the street address the secretary typed, where she can read it', () => {
    const text = visibleText(renderFor(style, '100 Dog Show Lane, Tulsa, OK 74101'));

    expect(text).toContain('100 Dog Show Lane, Tulsa, OK 74101');
  });

  it('prints the city and state when the show has no street address', () => {
    const text = visibleText(renderFor(style, null));

    expect(text).toContain('Tulsa, Oklahoma');
    expect(text).not.toContain('Dog Show Lane');
  });
});

describe('visibleText', () => {
  it('does not count an address that is only in an attribute', () => {
    const html =
      '<a href="https://maps.example" aria-label="Directions to 100 Dog Show Lane">Map</a>';

    expect(html).toContain('100 Dog Show Lane');
    expect(visibleText(html)).toBe('Map');
  });
});
