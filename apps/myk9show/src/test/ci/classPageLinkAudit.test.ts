import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { exhibitorShowDayHref } from '@/utils/exhibitorShowDayLink';
import { getShowDeskClassHref } from '@/features/show-map/cockpit/cockpitRoutes';
import { buildClassDetailsRelatedLinks } from '@/pages/ClassDetailsPage/classDetailsRelatedLinks';

/**
 * MYK9-1942, Phase 5: the link audit. A class has one home per role (Show Desk's class panel for
 * the secretary, Ringside on the day and My Shows otherwise for the exhibitor); the class page
 * is for a class's released results and Requirements. So a link that builds the class-page URL
 * is a decision, and this audit makes it a visible one.
 *
 * Two halves:
 * 1. The builders every staff and show-day exhibitor link goes through never return the class
 *    page, whatever the day or role.
 * 2. Every source file that builds a class-page URL is listed below with why and how many. The count
 *    must match exactly: a new file or one more link fails until it is listed (the moment to ask
 *    "should this open Show Desk or Ringside?"), and a link removed fails until its allowance is
 *    lowered, so the lists never go stale.
 */

const SRC = join(__dirname, '..', '..');

const CLASS_PAGE_URL =
  /getClassDetailHref\(|getShowMapClassHref\(|trials\/\$\{[^}]+\}\/classes\/\$\{[^}]+\}[`'"]|['`]\/classes\/(?:['`:]|\$\{)/;

const CLASS_PAGE_URL_EVERY = new RegExp(CLASS_PAGE_URL.source, 'g');

/** Files that define or route the class page itself; they are the destination, not a link to it. */
const DESTINATION: Record<string, number> = {
  'features/admin-help/data/pageDirectory.ts': 1,
  'features/admin-help/utils/resolveExamplePath.ts': 3,
  'features/show-map/showMapRoutes.ts': 2,
  'pages/ClassDetailsPage/index.tsx': 2,
  'routes/ClassDetailsRedirect.tsx': 2,
  'routes/LegacyPipelineRedirects.tsx': 1,
  'routes/routeRegistry.ts': 1,
  'utils/classDetailHref.ts': 3,
};

/** Opens the class's released results, under the privacy rules: the class page's one job. */
const RELEASED_RESULTS: Record<string, number> = {
  'components/dogs/DogDetails/Competitions/PastResults/PastResultsSection.tsx': 1,
  'components/dogs/DogDetailsMain/ActivityTab.tsx': 1,
};

/**
 * The public and exhibitor browse of a show's classes and schedule. A manager is sent to Show
 * Desk before these render (TrialDetailsPage redirects a trial manager to the show home), so
 * the class page they open is the read-only one an exhibitor sees.
 */
const BROWSE_BEFORE_THE_SHOW: Record<string, number> = {
  'components/schedule/CompactScheduleTimeline.tsx': 1,
  'components/schedule/TrialSpine.tsx': 1,
  'components/schedule/TrialTimeline.tsx': 1,
  'components/shows/tabs/ClassesTab.tsx': 2,
  'components/trials/TrialDetail/TrialClassesCards.tsx': 1,
  'components/trials/TrialDetail/TrialClassesTable.tsx': 1,
};

/**
 * KNOWN GAP: staff doors that still open the (read-only) class page rather than Show Desk. The
 * plan (docs/plan-one-home-per-class.md, Secretary 4) wants these to open the class on Show Desk.
 * They are listed so the gap is explicit and cannot grow; remove an entry when its link moves.
 */
const STAFF_DOORS_STILL_OPEN: Record<string, number> = {
  'components/entries/management/entryManagementRelatedLinks.ts': 1,
  'hooks/useBreadcrumb.ts': 2,
  'pages/scoring/PaperScoresheetPage.tsx': 2,
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      return name === 'test' || name === '__tests__' ? [] : sourceFiles(full);
    }
    return /\.tsx?$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name) && !name.endsWith('.d.ts')
      ? [full]
      : [];
  });
}

describe('link audit: who may open the class page (MYK9-1942)', () => {
  it('every source file builds exactly the class-page URLs it is accounted for', () => {
    const found = new Map<string, number>();
    for (const file of sourceFiles(SRC)) {
      const matches = readFileSync(file, 'utf8').match(CLASS_PAGE_URL_EVERY);
      if (matches) found.set(relative(SRC, file).split(sep).join('/'), matches.length);
    }

    // Equality, not a ceiling: a count that fell must be lowered here too, so the lists always
    // say exactly what the code does and a removed link cannot be quietly re-added later.
    const accounted = new Map<string, number>(
      Object.entries({
        ...DESTINATION,
        ...RELEASED_RESULTS,
        ...BROWSE_BEFORE_THE_SHOW,
        ...STAFF_DOORS_STILL_OPEN,
      })
    );
    const problems: string[] = [];
    for (const [file, count] of found) {
      const allowed = accounted.get(file);
      if (allowed === undefined) {
        problems.push(`${file}: ${count} class-page link(s), this link is not allowed`);
      } else if (count !== allowed) {
        problems.push(
          count > allowed
            ? `${file}: ${count} class-page links vs ${allowed} allowed, this link is not allowed`
            : `${file}: ${count} class-page links vs ${allowed} allowed, lower its allowance in this change (remove the entry at zero)`
        );
      }
    }
    for (const [file, allowed] of accounted) {
      if (!found.has(file)) {
        problems.push(
          `${file}: 0 class-page links vs ${allowed} allowed, lower its allowance in this change (remove the entry)`
        );
      }
    }

    expect(problems).toEqual([]);
  });

  describe('the exhibitor show-day link', () => {
    const base = { showId: 'show-1', trialDate: '2026-05-10', timezone: 'America/Los_Angeles' };

    it.each([
      ['the day before', '2026-05-09T20:00:00Z'],
      ['the trial day', '2026-05-10T20:00:00Z'],
      ['the day after', '2026-05-11T20:00:00Z'],
    ])('never opens the class page, %s', (_when, now) => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(now));
      try {
        expect(exhibitorShowDayHref(base)).not.toContain('/classes/');
        expect(exhibitorShowDayHref({ ...base, timezone: undefined })).not.toContain('/classes/');
        expect(exhibitorShowDayHref({ ...base, trialDate: '' })).not.toContain('/classes/');
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('staff links', () => {
    it('Show Desk class links open the desk, not the class page', () => {
      const href = getShowDeskClassHref({
        showId: 'show-1',
        classId: 'class-1',
        day: '2026-05-10',
      });
      expect(href).toBe('/shows/show-1?day=2026-05-10&focus=class-1');
      expect(href).not.toContain('/classes/');
    });

    it('the class page offers staff Show Desk and no link back to itself', () => {
      const links = buildClassDetailsRelatedLinks({
        isStaff: true,
        showId: 'show-1',
        trialId: 'trial-1',
        classId: 'class-1',
        classDay: '2026-05-10',
      });
      expect(links.map(link => link.key)).toContain('show-desk');
      for (const link of links) expect(link.href).not.toMatch(/\/classes\/class-1(?:$|\?)/);
    });
  });
});
