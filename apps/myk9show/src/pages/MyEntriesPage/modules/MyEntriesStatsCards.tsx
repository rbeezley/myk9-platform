/**
 * Stats cards component for MyEntriesPage
 * Displays summary statistics in Premium cards
 * @module MyEntriesPage/components
 */

import React from 'react';
import { Users, CheckCircle2, AlertCircle, DollarSign } from 'lucide-react';
import type { EntryStats } from './my-entries-types';

interface MyEntriesStatsCardsProps {
  stats: EntryStats;
}

/**
 * Premium stats cards showing entry summary
 */
export const MyEntriesStatsCards: React.FC<MyEntriesStatsCardsProps> = ({ stats }) => {
  return (
    <div className="myk9-show-stats-section">
      <div className="myk9-show-stats-grid">
        {/* Total Entries Card */}
        <div className="myk9-show-stat-card">
          <div className="myk9-show-stat-layout">
            <div className="myk9-show-stat-icon entries">
              <Users className="w-5 h-5" />
            </div>

            <div className="myk9-show-stat-content">
              <div className="myk9-show-stat-header">
                <div className="myk9-show-stat-title">Total Entries</div>
              </div>
              <div className="myk9-show-stat-number">{stats.total}</div>
            </div>
          </div>

          <div className="myk9-show-stat-details">
            <span>Active: {stats.accepted}</span>
            <span>{stats.upcoming} upcoming</span>
          </div>

          <div className="myk9-show-stat-progress">
            <div
              className="myk9-show-stat-progress-bar entries"
              style={{ width: `${stats.acceptedPercent}%` }}
            />
          </div>
        </div>

        {/* Accepted Card */}
        <div className="myk9-show-stat-card">
          <div className="myk9-show-stat-layout">
            <div className="myk9-show-stat-icon judges">
              <CheckCircle2 className="w-5 h-5" />
            </div>

            <div className="myk9-show-stat-content">
              <div className="myk9-show-stat-header">
                <div className="myk9-show-stat-title">Accepted</div>
              </div>
              <div className="myk9-show-stat-number">{stats.accepted}</div>
            </div>
          </div>

          <div className="myk9-show-stat-details">
            <span>Ready to compete</span>
            <span>{stats.acceptedPaid} paid</span>
          </div>

          <div className="myk9-show-stat-progress">
            <div
              className="myk9-show-stat-progress-bar judges"
              style={{ width: `${stats.acceptedPercent}%` }}
            />
          </div>
        </div>

        {/* Needs Action Card */}
        <div className="myk9-show-stat-card">
          <div className="myk9-show-stat-layout">
            <div className="myk9-show-stat-icon qualified">
              <AlertCircle className="w-5 h-5" />
            </div>

            <div className="myk9-show-stat-content">
              <div className="myk9-show-stat-header">
                <div className="myk9-show-stat-title">Needs Action</div>
              </div>
              <div className="myk9-show-stat-number">{stats.needsAction}</div>
            </div>
          </div>

          <div className="myk9-show-stat-details">
            <span>{stats.pending} awaiting review</span>
            <span>{stats.acceptedUnpaid} payment due</span>
          </div>

          <div className="myk9-show-stat-progress">
            <div
              className="myk9-show-stat-progress-bar qualified"
              style={{ width: `${stats.needsActionPercent}%` }}
            />
          </div>
        </div>

        {/* Total Fees Card */}
        <div className="myk9-show-stat-card">
          <div className="myk9-show-stat-layout">
            <div className="myk9-show-stat-icon trials">
              <DollarSign className="w-5 h-5" />
            </div>

            <div className="myk9-show-stat-content">
              <div className="myk9-show-stat-header">
                <div className="myk9-show-stat-title">Total Fees</div>
              </div>
              <div className="myk9-show-stat-number">${stats.totalFees}</div>
            </div>
          </div>

          <div className="myk9-show-stat-details">
            <span>${stats.paidFees} paid</span>
            <span>${stats.unpaidFees} pending</span>
          </div>

          <div className="myk9-show-stat-progress">
            <div
              className="myk9-show-stat-progress-bar trials"
              style={{ width: `${stats.paidPercent}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
