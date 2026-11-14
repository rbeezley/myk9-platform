import React from 'react';
import type { ReportProps } from '@/lib/reports/types';
import { buildAscaHighInTrial } from '@/lib/reports/ascaHighInTrial';
import type { AscaHitIneligibleTeam } from '@/lib/reports/ascaHighInTrial';
import { formatArmbandDisplay } from '@/utils/armbandUtils';
import { LevelSection } from './HighInTrialReport';
import { TrialInfoBox } from './TrialInfoBox';

/**
 * ASCA Scent Detection High in Trial, Program Rules §1.10. The rules live in
 * `lib/reports/ascaHighInTrial.ts`; this reuses the AKC report's level layout.
 *
 * ASCA leaves offering HIT to the host club (§1.10.1). There is no club setting: every
 * level that ran two or more elements shows its standing, and the secretary simply does
 * not hand out an award the club did not announce.
 */

const RULEBOOK = 'ASCA rule ';
const HIT_SECTION = '1.10.3';

const IneligibleNote: React.FC<{ teams: AscaHitIneligibleTeam[] }> = ({ teams }) => {
  const multiple = teams.filter(team => team.reason === 'multiple-levels');
  const levelC = teams.filter(team => team.reason === 'level-c');
  if (teams.length === 0) return null;

  return (
    <div className="stats-section">
      <div className="stats-section-header">Teams not eligible</div>
      {multiple.length > 0 && (
        <>
          <p className="catalog-empty">
            Entered in more than one level at this trial, so ineligible for High in Trial (ASCA rule
            §1.10.4):
          </p>
          <ul>
            {multiple.map(team => (
              <li key={team.key}>
                {formatArmbandDisplay(team.armband)} {team.callName} ({team.handler}):{' '}
                {team.levels.join(', ')}
              </li>
            ))}
          </ul>
        </>
      )}
      {levelC.length > 0 && (
        <p className="catalog-empty">
          {levelC.length} {levelC.length === 1 ? 'team is' : 'teams are'} entered in Level C, so
          ineligible for High in Trial (ASCA rule §1.10.5).
        </p>
      )}
    </div>
  );
};

export const AscaHighInTrialReport: React.FC<ReportProps> = ({
  showName,
  trial,
  entries,
  allClasses,
}) => {
  const model = buildAscaHighInTrial({
    entries,
    // `status` and `section` are load-bearing: a cancelled class is not offered, and a
    // Level C class (section C) is not an element of the level's HIT (§1.10.5).
    classes: (allClasses ?? []).map(c => ({
      id: c.id,
      element: c.element,
      level: c.level,
      section: c.section ?? null,
      status: c.status ?? null,
    })),
  });
  const singleElementLevels = [
    ...new Set(model.exclusions.filter(e => e.reason === 'single-element-level').map(e => e.level)),
  ];

  return (
    <div className="report-page">
      <div className="report-header">
        <span className="report-logo">myK9Show</span>
        <h1 className="report-title">ASCA High in Trial</h1>
        {showName && <p className="report-subtitle">{showName}</p>}
      </div>

      <TrialInfoBox trial={trial} />

      {model.levels.length === 0 ? (
        <p className="catalog-empty">
          No High in Trial applies to this trial. ASCA rule §1.10.2 awards one High in Trial per
          level, which needs a level that ran more than one element (Container, Interior, Exterior,
          Vehicle).
        </p>
      ) : (
        model.levels.map(level => (
          <LevelSection key={level.level} level={level} section={HIT_SECTION} rulebook={RULEBOOK} />
        ))
      )}

      {singleElementLevels.length > 0 && (
        <div className="stats-section">
          <div className="stats-section-header">Levels without High in Trial</div>
          <p className="catalog-empty">
            Only one element ran at {singleElementLevels.join(', ')}, so High in Trial does not
            apply there.
          </p>
        </div>
      )}

      <IneligibleNote teams={model.ineligible} />

      <div className="report-footer">
        <div className="footer-left">
          <p>
            Eligible teams were entered in one level only and qualified in every element offered at
            it. Faults and times are added across the elements offered; the fewest faults, then the
            lowest time, wins (ASCA rule §1.10.3). Offering High in Trial is the host club&apos;s
            choice (§1.10.1).
          </p>
        </div>
      </div>
    </div>
  );
};
