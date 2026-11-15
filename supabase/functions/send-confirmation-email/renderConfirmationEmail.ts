// Picks the show's email style and renders the full confirmation. Deno-free so vitest can import
// it. Moved out of index.ts (MYK9-1999); the only changes are that the poster's licence line
// comes from the show's registry rather than always naming the AKC.

import { resolveEmailStyle, selectEmailBuilderKey } from './email-style-registry.ts';
import { buildHeadlineHtml } from './headline-email.ts';
import { buildMonogramHtml } from './monogram-email.ts';
import { buildBannerHtml } from './banner-email.ts';
import { buildFieldGuideHtml } from './fieldGuide-email.ts';
import { buildGazetteHtml } from './gazette-email.ts';
import { buildMagazineHtml } from './magazine-email.ts';
import { buildPosterHtml } from './poster-email.ts';
import { buildHeritageHtml, type HeritageEmailData } from './heritage-email.ts';
import {
  deriveGazetteEditionLabel,
  deriveMagazineEditionLabel,
  deriveShowAbbreviation,
  deriveShowCode,
} from './dispatch-helpers.ts';
import type { RegistryEmailLanguage } from './registryLanguage.ts';

/** The show columns the style dispatch reads. */
export interface ConfirmationStyleShow {
  start_date: string;
  style?: string | null;
  experience_published_style?: string | null;
  brand_color?: string | null;
}

/** The full confirmation's HTML in the show's published style. */
export function renderConfirmationEmail(
  emailData: HeritageEmailData,
  show: ConfirmationStyleShow,
  registry: RegistryEmailLanguage
): string {
  const emailBuilder = selectEmailBuilderKey(
    resolveEmailStyle(show.experience_published_style ?? show.style)
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

  // The styles that print one armband up front take it only when every run shares it: one
  // email can cover several dogs, each with its own armband.
  const armbands = new Set(emailData.runs.map(run => run.armband).filter(Boolean));
  const primaryArmband = armbands.size === 1 ? (emailData.runs[0]?.armband ?? null) : null;

  switch (emailBuilder) {
    case 'headline':
      return buildHeadlineHtml(emailData);
    case 'monogram':
      return buildMonogramHtml({ ...emailData, monogramLetters });
    case 'banner':
      // shows.brand_color is NOT NULL with a default (20260515212527); the builder still
      // validates the hex and falls back to deep teal defensively.
      return buildBannerHtml({
        ...emailData,
        brandColor: typeof show.brand_color === 'string' ? show.brand_color : '#0d4d4f',
      });
    case 'fieldGuide':
      return buildFieldGuideHtml({
        ...emailData,
        showCode: deriveShowCode(emailData.clubName, emailData.showTitle, show.start_date),
        armbandNumber: primaryArmband,
      });
    case 'gazette':
      return buildGazetteHtml({ ...emailData, editionLabel: deriveGazetteEditionLabel() });
    case 'magazine':
      return buildMagazineHtml({
        ...emailData,
        editionLabel: deriveMagazineEditionLabel(show.start_date),
        primaryArmband,
        // No license-reference column yet: the footer line stays off until one lands.
        licenseReference: null,
      });
    case 'poster':
      return buildPosterHtml({
        ...emailData,
        showAbbreviation: deriveShowAbbreviation(emailData.showTitle, show.start_date),
        armband: primaryArmband,
        licenseLanguage: registry.licenseLanguage,
      });
    default:
      return buildHeritageHtml(emailData);
  }
}
