/**
 * The /sms disclosure page is a compliance artifact, not ordinary marketing
 * copy. Mobile carriers verify an SMS program during A2P 10DLC review by
 * loading its public URL and reading it, so two things must stay true or the
 * messaging campaign is rejected:
 *
 *   1. The route stays PUBLIC. Behind auth a reviewer sees a login wall, and
 *      the campaign is rejected for "opt-in not verifiable" — the single most
 *      common rejection cause.
 *   2. The page keeps the required disclosures. Dropping "Msg & data rates may
 *      apply", the STOP/HELP instructions, or the mobile-information
 *      non-sharing sentence breaks the filing even though the page still
 *      renders perfectly.
 *
 * Neither failure is visible in the UI, which is why they are pinned here
 * rather than left to review. See docs/operations/sms-10dlc-registration.md.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const repoAppRoot = join(__dirname, '../../..');
const routesSource = readFileSync(join(repoAppRoot, 'src/routes/publicRoutes.tsx'), 'utf8');
const disclosure = readFileSync(join(repoAppRoot, 'public/legal/sms-alerts.md'), 'utf8');

/** The JSX for the <Route path="/sms" ...> element, isolated from its siblings. */
function smsRouteBlock(source: string): string {
  const start = source.indexOf('path="/sms"');
  expect(start, 'no /sms route found in publicRoutes.tsx').toBeGreaterThan(-1);
  const routeOpen = source.lastIndexOf('<Route', start);
  const routeClose = source.indexOf('/>', start);
  return source.slice(routeOpen, routeClose);
}

describe('/sms route registration', () => {
  it('is registered and renders the SMS disclosure markdown', () => {
    const block = smsRouteBlock(routesSource);
    expect(block).toContain('markdownPath="/legal/sms-alerts.md"');
  });

  it('is NOT wrapped in ProtectedRoute — a carrier reviewer must reach it signed out', () => {
    expect(smsRouteBlock(routesSource)).not.toContain('ProtectedRoute');
  });
});

describe('SMS disclosure content', () => {
  it('names the program so a reviewer can match it to the campaign', () => {
    expect(disclosure).toMatch(/myK9Show Ring Alerts/);
  });

  it('carries the rate and frequency disclosures verbatim', () => {
    expect(disclosure).toMatch(/Message and data rates may apply/i);
    expect(disclosure).toMatch(/frequency varies/i);
  });

  it('states both opt-out and help keywords', () => {
    expect(disclosure).toMatch(/\bSTOP\b/);
    expect(disclosure).toMatch(/\bHELP\b/);
  });

  it('carries the mobile-information non-sharing sentence carriers look for', () => {
    expect(disclosure).toMatch(
      /No mobile information is shared with third parties or affiliates for marketing or promotional purposes/i
    );
  });

  it('shows the consent wording, which must match the version stored at opt-in', () => {
    // Pinned against notification_preferences.sms_consent_text_version.
    // Changing this text means bumping that version, not a silent edit.
    expect(disclosure).toContain(
      'By checking this box I agree to receive SMS ring alerts from myK9Show'
    );
  });

  it('says the program is optional — bundled consent is not valid consent', () => {
    expect(disclosure).toMatch(/never required/i);
  });

  it('reaches the support address on the registered brand domain', () => {
    expect(disclosure).toContain('support@myk9show.com');
  });

  it('links to the privacy policy absolutely, since the renderer drops relative links', () => {
    // LegalPage.inlineFormat only linkifies http(s) URLs — a relative
    // [Privacy Policy](/privacy) silently renders as plain text, leaving the
    // reviewer with no way to click through.
    expect(disclosure).toContain('(https://myk9show.com/privacy)');
  });
});
