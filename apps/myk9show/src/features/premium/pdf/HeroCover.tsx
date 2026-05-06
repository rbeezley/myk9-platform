import { STYLE_TOKENS, buildMonogram, formatDate } from './pdfStyles';
import type { GeneratedPremium } from '../../../types/premium-types';
import type { CoverContext } from './covers/coverContext';
import { renderCenteredCover } from './covers/CenteredCover';
import { renderTopblockCover } from './covers/TopblockCover';
import { renderLowerthirdCover } from './covers/LowerthirdCover';
import { renderEditorialCover } from './covers/EditorialCover';
import { renderEngravedCover } from './covers/EngravedCover';
import { renderPosterCover } from './covers/PosterCover';

interface HeroCoverProps {
  data: GeneratedPremium;
}

function assertNever(x: never): never {
  throw new Error(`Unhandled coverStyle: ${String(x)}`);
}

/**
 * Cover page dispatcher. Each cover renderer lives in its own file under
 * `covers/` so individual layouts stay focused and the dispatcher stays small.
 *
 * The 2 remaining stub coverStyles ('masthead' | 'fieldindex') still fall
 * through to the centered renderer until Phase 4 adds their dedicated
 * layouts — their tokens are monogram clones so the output looks intentional.
 */
export function HeroCover({ data }: HeroCoverProps) {
  const t = STYLE_TOKENS[data.style];
  const dateRange =
    data.show.endDate && data.show.endDate !== data.show.startDate
      ? `${formatDate(data.show.startDate)} – ${formatDate(data.show.endDate)}`
      : formatDate(data.show.startDate);
  const club = data.club.name ?? 'Host Club';
  const venue = data.show.venue ?? '';
  const org = data.org;
  const monogram = buildMonogram(club);

  const ctx: CoverContext = { t, data, dateRange, club, venue, org, monogram };

  switch (t.coverStyle) {
    case 'centered':
      return renderCenteredCover(ctx);
    case 'topblock':
      return renderTopblockCover(ctx);
    case 'lowerthird':
      return renderLowerthirdCover(ctx);
    case 'editorial':
      return renderEditorialCover(ctx);
    case 'engraved':
      return renderEngravedCover(ctx);
    case 'poster':
      return renderPosterCover(ctx);
    case 'masthead':
    case 'fieldindex':
      // Phase 1 stubs still falling through to centered until Phase 4 adds
      // their dedicated renderers.
      return renderCenteredCover(ctx);
    default:
      return assertNever(t.coverStyle);
  }
}
