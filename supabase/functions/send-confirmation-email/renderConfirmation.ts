// Renders the full confirmation in the show's published style (moved out of index.ts for
// MYK9-1999), with the Note to exhibitors and the My Shows link above the footer of every style.
// Deno-free so vitest can import it.

import {
  withExhibitorExtras,
  type ConfirmationEmailBaseData,
} from './confirmation-email-shared.ts';
import { resolveEmailStyle, selectEmailBuilderKey } from './email-style-registry.ts';
import { buildHeritageHtml } from './heritage-email.ts';
import { buildHeadlineHtml } from './headline-email.ts';
import { buildMonogramHtml } from './monogram-email.ts';
import { buildBannerHtml } from './banner-email.ts';
import { buildFieldGuideHtml } from './fieldGuide-email.ts';
import { buildGazetteHtml } from './gazette-email.ts';
import { buildMagazineHtml } from './magazine-email.ts';
import { buildPosterHtml } from './poster-email.ts';
import {
  deriveGazetteEditionLabel,
  deriveMagazineEditionLabel,
  deriveShowAbbreviation,
  deriveShowCode,
} from './dispatch-helpers.ts';

export interface ConfirmationStyleInputs {
  style: string | null;
  experiencePublishedStyle: string | null;
  brandColor: unknown;
  startDate: string;
  /** The registry's license line (Poster prints it), from registryWording(). */
  licenseLanguage: string;
}

export function renderConfirmationHtml(
  emailData: ConfirmationEmailBaseData,
  show: ConfirmationStyleInputs
): string {
  const builder = selectEmailBuilderKey(
    resolveEmailStyle(show.experiencePublishedStyle ?? show.style)
  );

  // Mirrors apps/myk9show/src/features/monogram/utils/buildMonogram.ts (canonical app-side
  // helper) and the older premium/pdf/pdfStyles.ts helper. Inline here because Deno edge
  // functions cannot import from workspace packages. Keep the three copies semantically aligned.
  const monogramLetters =
    (emailData.clubName || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 3)
      .map(w => w[0]!.toUpperCase())
      .join('') || '?';

  // One armband for the whole email only when every run shares it (one dog). Several dogs have
  // several armbands, which each run row carries.
  const armbands = [...new Set(emailData.runs.map(run => run.armband).filter(Boolean))];
  const primaryArmband = armbands.length === 1 ? (armbands[0] ?? null) : null;

  let html: string;
  if (builder === 'headline') {
    html = buildHeadlineHtml(emailData);
  } else if (builder === 'monogram') {
    html = buildMonogramHtml({ ...emailData, monogramLetters });
  } else if (builder === 'banner') {
    // shows.brand_color is NOT NULL with a default; the builder still validates the hex.
    html = buildBannerHtml({
      ...emailData,
      brandColor: typeof show.brandColor === 'string' ? show.brandColor : '#0d4d4f',
    });
  } else if (builder === 'fieldGuide') {
    html = buildFieldGuideHtml({
      ...emailData,
      showCode: deriveShowCode(emailData.clubName, emailData.showTitle, show.startDate),
      armbandNumber: primaryArmband,
    });
  } else if (builder === 'gazette') {
    html = buildGazetteHtml({ ...emailData, editionLabel: deriveGazetteEditionLabel() });
  } else if (builder === 'magazine') {
    html = buildMagazineHtml({
      ...emailData,
      editionLabel: deriveMagazineEditionLabel(show.startDate),
      primaryArmband,
      // No license-reference column yet.
      licenseReference: null,
    });
  } else if (builder === 'poster') {
    html = buildPosterHtml({
      ...emailData,
      showAbbreviation: deriveShowAbbreviation(emailData.showTitle, show.startDate),
      armband: primaryArmband,
      licenseLanguage: show.licenseLanguage,
    });
  } else {
    html = buildHeritageHtml(emailData);
  }
  return withExhibitorExtras(html, emailData);
}
