/**
 * StatsSummaryCards Component
 *
 * Displays summary cards at the top of the Stats page.
 * Extracted to reduce complexity of main Stats component.
 */

import React from 'react';
import { BarChart3, Award, Clock, TrendingUp } from 'lucide-react';
import type { StatsData, StatsFilters, FastestTimeEntry } from '../types/stats.types';

interface StatsSummaryCardsProps {
  data: StatsData;
  filters: StatsFilters;
  filteredFastestTime: FastestTimeEntry | null;
}

export function StatsSummaryCards({
  data,
  filters,
  filteredFastestTime
}: StatsSummaryCardsProps): React.ReactElement {
  const scoredPercentage = data.totalAllEntries > 0
    ? Math.round((data.scoredEntries / data.totalAllEntries) * 100)
    : 0;

  const entriesSubtitle = filters.breed
    ? `${data.uniqueDogs} ${data.uniqueDogs === 1 ? 'dog' : 'dogs'} • ${data.scoredEntries} of ${data.totalAllEntries} scored`
    : `${data.scoredEntries} of ${data.totalAllEntries} scored`;

  return (
    <div className="stats-cards">
      <div className="stats-card">
        <div className="card-icon total">
          <BarChart3 />
        </div>
        <div className="card-content">
          <h3>Entries</h3>
          <p className="card-value">{scoredPercentage}%</p>
          <p className="card-subtitle">{entriesSubtitle}</p>
        </div>
      </div>

      <div className="stats-card">
        <div className="card-icon qualified">
          <Award />
        </div>
        <div className="card-content">
          <h3>Qualification Rate</h3>
          <p className="card-value">{data.qualificationRate.toFixed(1)}%</p>
          <p className="card-subtitle">{data.qualifiedCount} qualified</p>
        </div>
      </div>

      <div className="stats-card">
        <div className="card-icon fastest">
          <Clock />
        </div>
        <div className="card-content">
          <h3>Fastest Time</h3>
          {filteredFastestTime ? (
            <>
              <p className="card-value">{filteredFastestTime.searchTimeSeconds.toFixed(2)}s</p>
              <p className="card-subtitle">{filteredFastestTime.dogCallName}</p>
            </>
          ) : (
            <p className="card-value">N/A</p>
          )}
        </div>
      </div>

      <div className="stats-card">
        <div className="card-icon average">
          <TrendingUp />
        </div>
        <div className="card-content">
          <h3>Average Time</h3>
          <p className="card-value">
            {data.averageTime ? `${data.averageTime.toFixed(2)}s` : 'N/A'}
          </p>
          <p className="card-subtitle">
            {data.medianTime ? `Median: ${data.medianTime.toFixed(2)}s` : ''}
          </p>
        </div>
      </div>
    </div>
  );
}
