import React from 'react';
import type { ReportProps } from '@/lib/reports/types';
import { formatReportTime, buildReportOrgTitle } from '@/lib/reports/reportUtils';
import { formatArmbandDisplay } from '@/utils/armbandUtils';
import { buildHighInTrial } from '@/lib/reports/highInTrial';
import type { HighInTrialExclusion, HighInTrialLevel } from '@/lib/reports/highInTrial';
import { TrialInfoBox } from './TrialInfoBox';

/**
 * AKC Scent Work High in Trial — Regulations Chapter 6 §8 / §10.
 *
 * The rules live in `lib/reports/highInTrial.ts`; this renders them. Two presentation
 * choices are load-bearing rather than cosmetic:
 *
 * - A tie at rank 1 is printed as a tie with an explicit coin-flip instruction. §8's
 *   final tie-break is a physical act, so the report must hand the decision to the
 *   secretary instead of quietly picking one.
 * - A level with unscored entries is labelled PROVISIONAL. Handing someone a trophy on
 *   a standing that can still move is the failure this report exists to prevent.
 */

function formatTotalTime(seconds: number | null): string {
  return seconds == null ? '—' : formatReportTime(seconds);
}

/**
 * Why a class the secretary can see on the schedule is not in the maths above. Without
 * this, a trial whose Novice level ran one element shows no Novice section at all, which
 * reads as a missing report rather than as the rule in §8.
 */
const ExclusionNote: React.FC<{ exclusions: HighInTrialExclusion[] }> = ({ exclusions }) => {
  if (exclusions.length === 0) return null;

  const single = exclusions.filter(e => e.reason === 'single-element-level');
  const notElement = exclusions.filter(e => e.reason === 'not-an-odor-search-element');

  return (
    <div className="stats-section">
      <div className="stats-section-header">Classes not counted</div>
      {single.length > 0 && (
        <p className="catalog-empty">
          Only one element ran at these levels, so Chapter 6 §8 confers no High in Trial:{' '}
          {single.map(e => `${e.element} ${e.level}`).join(', ')}.
        </p>
      )}
      {notElement.length > 0 && (
        <p className="catalog-empty">
          Not one of the four Odor Search elements, so excluded from High in Trial:{' '}
          {notElement.map(e => `${e.element} ${e.level}`).join(', ')}.
        </p>
      )}
    </div>
  );
};

const LevelSection: React.FC<{ level: HighInTrialLevel }> = ({ level }) => {
  const winners = level.teams.filter(team => team.rank === 1);

  return (
    <div className="stats-section">
      <div className="stats-section-header">
        {level.level} High in Trial
        {!level.isFinal && ' — PROVISIONAL'}
      </div>

      <div className="info-row">
        <span className="info-label">Elements counted:</span>
        <span className="info-value">{level.elements.join(', ')}</span>
      </div>

      {!level.isFinal && (
        <p className="catalog-empty">
          {level.pendingCount} {level.pendingCount === 1 ? 'entry has' : 'entries have'} no
          result yet. This standing can still change — do not award until the level is
          fully scored.
        </p>
      )}

      {level.teams.length === 0 ? (
        <p className="catalog-empty">
          No team qualified in every element offered at this level, so no High in Trial is
          awarded.
        </p>
      ) : (
        <>
          {level.needsCoinFlip && (
            <p className="nq-text">
              TIE — {winners.length} teams are tied on both faults and time. Chapter 6 §8
              requires a coin flip to decide the winner. Record the outcome by hand.
            </p>
          )}

          <table className="report-table">
            <thead>
              <tr>
                <th className="place-col">Rank</th>
                <th className="armband-col">Armband</th>
                <th className="callname-col">Call Name</th>
                <th className="handler-col">Handler</th>
                {level.elements.map(element => (
                  <th key={element} className="faults-col">
                    {element}
                  </th>
                ))}
                <th className="faults-col">Total Faults</th>
                <th className="time-col">Total Time</th>
              </tr>
            </thead>
            <tbody>
              {level.teams.map(team => (
                <tr key={team.key}>
                  <td className="place-cell">
                    {team.rank}
                    {team.tiedCount > 1 ? ' (tie)' : ''}
                  </td>
                  <td>{formatArmbandDisplay(team.armband)}</td>
                  <td>{team.callName}</td>
                  <td>{team.handler}</td>
                  {team.elements.map(score => (
                    <td key={score.element} className="faults-col">
                      {score.faults} / {formatTotalTime(score.timeSeconds)}
                    </td>
                  ))}
                  <td className="faults-col">{team.totalFaults}</td>
                  <td className="time-cell">{formatTotalTime(team.totalTimeSeconds)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="qualified-count">
            Per-element cells show faults / time. Ranked by fewest total faults, then
            fastest total time (Chapter 6 §8).
          </p>
        </>
      )}
    </div>
  );
};

export const HighInTrialReport: React.FC<ReportProps> = ({
  showName,
  trial,
  entries,
  allClasses,
  organization,
  activityType,
}) => {
  const model = buildHighInTrial({
    entries,
    classes: (allClasses ?? []).map(c => ({ id: c.id, element: c.element, level: c.level })),
  });
  // buildReportOrgTitle appends an element slot; with none it leaves a trailing space.
  const orgTitle = buildReportOrgTitle(organization, activityType).trim();

  return (
    <div className="report-page">
      <div className="report-header">
        <span className="report-logo">myK9Show</span>
        <h1 className="report-title">{orgTitle} High in Trial</h1>
        {showName && <p className="report-subtitle">{showName}</p>}
      </div>

      <TrialInfoBox trial={trial} />

      {model.levels.length === 0 ? (
        <p className="catalog-empty">
          No High in Trial award applies to this trial. Chapter 6 §8 offers High in Trial
          only where a club runs more than one element (Container, Interior, Exterior,
          Buried) at the same difficulty level.
        </p>
      ) : (
        model.levels.map(level => <LevelSection key={level.level} level={level} />)
      )}

      <ExclusionNote exclusions={model.exclusions} />

      {/*
        `.report-footer` is `display: flex; justify-content: space-between`, built for a
        short left/right pair. Two bare <p> children become two cramped columns whose
        lines interleave, so the HD exclusion read as "(Chapteran must be worked out by
        hand ... 6 §8)". Both notes go in ONE column child so they stack.
      */}
      <div className="report-footer">
        <div className="footer-left">
          <p>
            Eligible teams entered every element offered at their difficulty level and
            qualified in each. Handler Discrimination is excluded from High in Trial even
            when offered (Chapter 6 §8). The High in Trial award is not recorded by the
            AKC.
          </p>
          <p>
            High Combined Division (§9) is not calculated by this report and must be
            worked out by hand where a club offers Handler Discrimination alongside High
            in Trial.
          </p>
        </div>
      </div>
    </div>
  );
};
