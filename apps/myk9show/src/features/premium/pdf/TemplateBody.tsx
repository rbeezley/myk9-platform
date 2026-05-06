import type { GeneratedPremium } from '../../../types/premium-types';
import { resolveTokens } from './pdfStyles';
import { AKCStandardBody } from './bodies/AKCStandardBody';
import { UKCStandardBody } from './bodies/UKCStandardBody';
import { PosterBody } from './bodies/PosterBody';
import { isPosterMinimumDataMet } from './bodies/posterPredicates';

interface Props {
  data: GeneratedPremium;
  org: 'AKC' | 'UKC';
}

function assertNever(x: never): never {
  throw new Error(`Unhandled bodyLayout: ${String(x)}`);
}

/**
 * Dispatches the body markup for a premium based on the style's `bodyLayout`
 * token. Each AKC and UKC template calls this exactly once so the body-layout
 * branching lives in a single place.
 *
 * - `'standard'`  — section-stacked layout (AKC/UKC variants)
 * - `'poster'`    — single-page hero with typography shift on inner pages.
 *                   Falls back to StandardBody when minimum data is missing
 *                   (no judges, no fees, no trials) so we never ship a
 *                   half-empty hero sheet.
 * - `'gazette'` / `'fieldguide'` — Phase 4. For now they fall back to
 *                   StandardBody so the templates render something credible.
 */
export function TemplateBody({ data, org }: Props) {
  const tokens = resolveTokens(data.style);
  const StandardBody = org === 'AKC' ? AKCStandardBody : UKCStandardBody;

  switch (tokens.bodyLayout) {
    case 'standard':
      return <StandardBody data={data} />;
    case 'poster':
      if (!isPosterMinimumDataMet(data)) return <StandardBody data={data} />;
      return <PosterBody data={data} tokens={tokens} />;
    case 'gazette':
    case 'fieldguide':
      // Phase 4 — these layouts render via the standard body until their
      // dedicated components land.
      return <StandardBody data={data} />;
    default:
      return assertNever(tokens.bodyLayout);
  }
}
