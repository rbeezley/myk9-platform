import React, { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { TrendingUp, Award, Clock, Calendar, BarChart3, ArrowRight } from 'lucide-react';
import type { ClassEntry } from '../hooks/useDogDetailsData';

interface DogStatisticsProps {
  classes: ClassEntry[];
  dogName: string;
}

/** Data shape for pie chart entries */
interface PieChartEntry {
  name: string;
  value: number;
  percentage: number;
  color: string;
}

/** Data shape for bar chart (judge performance) entries */
interface BarChartEntry {
  judgeName: string;
  displayName: string;
  classesJudged: number;
  qualifiedCount: number;
  qualificationRate: number;
  averageQualifiedTime: number | null;
  totalTimes: number[];
}

/** Recharts tooltip props for pie chart */
interface PieTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: PieChartEntry }>;
}

/** Recharts tooltip props for bar chart */
interface BarTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: BarChartEntry }>;
}

// Custom tooltip for pie chart
const CustomPieTooltip = ({ active, payload }: PieTooltipProps) => {
  if (active && payload && payload[0]) {
    const data = payload[0].payload;
    return (
      <div style={{
        backgroundColor: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--token-space-md)',
        padding: 'var(--token-space-lg)',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
      }}>
        <p style={{
          fontWeight: 600,
          color: 'var(--foreground)',
          margin: 0,
          fontSize: '0.9375rem'
        }}>
          {data.name}
        </p>
        <p style={{
          color: 'var(--muted-foreground)',
          fontSize: '0.8125rem',
          margin: '0.25rem 0 0 0'
        }}>
          Count: {data.value} ({data.percentage.toFixed(1)}%)
        </p>
      </div>
    );
  }
  return null;
};

// Custom tooltip for bar chart
const CustomBarTooltip = ({ active, payload }: BarTooltipProps) => {
  if (active && payload && payload[0]) {
    const data = payload[0].payload;
    return (
      <div style={{
        backgroundColor: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--token-space-md)',
        padding: 'var(--token-space-lg)',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
      }}>
        <p style={{
          fontWeight: 600,
          color: 'var(--foreground)',
          margin: 0,
          fontSize: '0.9375rem'
        }}>
          {data.displayName}
        </p>
        <div style={{ marginTop: 'var(--token-space-md)' }}>
          <p style={{
            color: 'var(--muted-foreground)',
            fontSize: '0.8125rem',
            margin: '0.25rem 0'
          }}>
            Classes: {data.classesJudged}
          </p>
          <p style={{
            color: 'var(--muted-foreground)',
            fontSize: '0.8125rem',
            margin: '0.25rem 0'
          }}>
            Qualified: {data.qualifiedCount}
          </p>
          <p style={{
            color: 'var(--primary)',
            fontSize: '0.875rem',
            fontWeight: 600,
            margin: '0.25rem 0'
          }}>
            Rate: {data.qualificationRate.toFixed(1)}%
          </p>
          {data.averageQualifiedTime && (
            <p style={{
              color: 'var(--muted-foreground)',
              fontSize: '0.8125rem',
              margin: '0.25rem 0'
            }}>
              Avg Q Time: {data.averageQualifiedTime.toFixed(2)}s
            </p>
          )}
        </div>
      </div>
    );
  }
  return null;
};

// Helper to determine if an entry is qualified
const isEntryQualified = (entry: ClassEntry): boolean => {
  if (!entry.is_scored) return false;

  // Check result_text for qualification status
  // Common result statuses: "Qualified", "Q", "Not Qualified", "NQ", etc.
  const resultText = entry.result_text?.toLowerCase() || '';

  // Check if explicitly qualified
  if (resultText.includes('qual') && !resultText.includes('not')) {
    return true;
  }

  // Check if explicitly NQ
  if (resultText.includes('not qual') || resultText === 'nq') {
    return false;
  }

  // Fallback: assume qualified if scored with low/no faults
  return entry.fault_count !== null && entry.fault_count < 3;
};

export const DogStatistics: React.FC<DogStatisticsProps> = ({ classes, dogName }) => {
  // Calculate statistics
  const stats = useMemo(() => {
    const scoredEntries = classes.filter(c => c.is_scored);

    // Only count visible qualifications based on release control settings
    const visibleQualifications = scoredEntries.filter(c => c.visibleFields?.showQualification);
    const qualifiedCount = visibleQualifications.filter(isEntryQualified).length;
    const nqCount = visibleQualifications.filter(c => !isEntryQualified(c)).length;
    const totalScored = visibleQualifications.length;

    // Results distribution data - use design tokens for colors
    const resultsData = [
      {
        name: 'Qualified',
        value: qualifiedCount,
        percentage: totalScored > 0 ? (qualifiedCount / totalScored) * 100 : 0,
        color: 'var(--status-qualified)' // Green from design tokens
      },
      {
        name: 'NQ',
        value: nqCount,
        percentage: totalScored > 0 ? (nqCount / totalScored) * 100 : 0,
        color: 'var(--status-not-qualified)' // Red from design tokens
      }
    ].filter(item => item.value > 0);

    // Performance by judge (only use visible data)
    const judgeMap = new Map<string, {
      judgeName: string;
      classesJudged: number;
      qualifiedCount: number;
      totalTimes: number[];
    }>();

    scoredEntries.forEach(entry => {
      const judgeName = entry.judge_name || 'TBD';
      const existing = judgeMap.get(judgeName) || {
        judgeName,
        classesJudged: 0,
        qualifiedCount: 0,
        totalTimes: []
      };

      existing.classesJudged++;

      // Only count qualification if it's visible
      if (entry.visibleFields?.showQualification && isEntryQualified(entry)) {
        existing.qualifiedCount++;

        // Only include time if both time and qualification are visible
        if (entry.visibleFields?.showTime && entry.search_time) {
          const timeInSeconds = parseFloat(entry.search_time);
          if (!isNaN(timeInSeconds)) {
            existing.totalTimes.push(timeInSeconds);
          }
        }
      }

      judgeMap.set(judgeName, existing);
    });

    const judgeData = Array.from(judgeMap.values()).map(judge => ({
      ...judge,
      displayName: judge.judgeName,
      qualificationRate: judge.classesJudged > 0
        ? (judge.qualifiedCount / judge.classesJudged) * 100
        : 0,
      averageQualifiedTime: judge.totalTimes.length > 0
        ? judge.totalTimes.reduce((a, b) => a + b, 0) / judge.totalTimes.length
        : null
    })).sort((a, b) => b.classesJudged - a.classesJudged);

    // Calculate fastest and average times (only from visible times)
    const qualifiedEntries = scoredEntries
      .filter(entry =>
        isEntryQualified(entry) &&
        entry.search_time &&
        entry.visibleFields?.showTime // Only include if time is visible
      )
      .map(entry => ({
        time: parseFloat(entry.search_time!),
        className: (() => {
          const parts = [entry.element, entry.level];
          if (entry.section && entry.section !== '-') {
            parts.push(entry.section);
          }
          return parts.filter(Boolean).join(' ');
        })()
      }))
      .filter(item => !isNaN(item.time));

    const fastestEntry = qualifiedEntries.length > 0
      ? qualifiedEntries.reduce((min, curr) => curr.time < min.time ? curr : min)
      : null;

    const fastestTime = fastestEntry?.time || null;
    const fastestClassName = fastestEntry?.className || null;

    const averageTime = qualifiedEntries.length > 0
      ? qualifiedEntries.reduce((sum, item) => sum + item.time, 0) / qualifiedEntries.length
      : null;

    // All classes for the table (scored and unscored)
    const allResults = classes.map(entry => {
      // Build class name without section if it's a dash
      const classNameParts = [entry.element, entry.level];
      if (entry.section && entry.section !== '-') {
        classNameParts.push(entry.section);
      }

      return {
        id: entry.id,
        className: classNameParts.filter(Boolean).join(' • '),
        trialDate: entry.trial_date,
        trialNumber: entry.trial_number,
        element: entry.element || '',
        level: entry.level || '',
        judgeName: entry.judge_name || 'TBD',
        time: entry.search_time,
        faults: entry.fault_count,
        placement: entry.position && entry.position !== 9996 ? entry.position : null,
        qualified: isEntryQualified(entry),
        visibleFields: entry.visibleFields,
        isScored: entry.is_scored,
        checkInStatus: entry.check_in_status || 'no-status'
      };
    }).sort((a, b) => {
      // Sort by: trial date (asc), trial number (asc), element (asc), level (asc)

      // 1. Trial date (oldest first)
      const dateCompare = new Date(a.trialDate).getTime() - new Date(b.trialDate).getTime();
      if (dateCompare !== 0) return dateCompare;

      // 2. Trial number (ascending)
      const trialNumA = a.trialNumber || 0;
      const trialNumB = b.trialNumber || 0;
      if (trialNumA !== trialNumB) return trialNumA - trialNumB;

      // 3. Element (alphabetical, handle empty strings)
      const elementA = a.element || '';
      const elementB = b.element || '';
      const elementCompare = elementA.localeCompare(elementB);
      if (elementCompare !== 0) return elementCompare;

      // 4. Level (alphabetical, handle empty strings)
      const levelA = a.level || '';
      const levelB = b.level || '';
      return levelA.localeCompare(levelB);
    });

    return {
      totalClasses: classes.length,
      totalScored: scoredEntries.length,
      qualifiedCount,
      nqCount,
      qualificationRate: totalScored > 0 ? (qualifiedCount / totalScored) * 100 : 0,
      fastestTime,
      fastestClassName,
      averageTime,
      resultsData,
      judgeData,
      allResults
    };
  }, [classes]);

  const formatTime = (time: string | null) => {
    if (!time) return '--';
    const timeNum = parseFloat(time);
    return isNaN(timeNum) ? time : `${timeNum.toFixed(2)}s`;
  };

  const getCheckInStatusLabel = (status: string) => {
    switch (status) {
      case 'checked-in': return 'Checked In';
      case 'at-gate': return 'At Gate';
      case 'conflict': return 'Conflict';
      case 'pulled': return 'Pulled';
      default: return 'No Status';
    }
  };

  const getCheckInStatusColor = (status: string) => {
    switch (status) {
      case 'checked-in': return 'var(--checkin-checked-in)';
      case 'at-gate': return 'var(--checkin-at-gate)';
      case 'conflict': return 'var(--checkin-conflict)';
      case 'pulled': return 'var(--checkin-pulled)';
      default: return 'var(--status-no-status)';
    }
  };

  const formatDate = (dateStr: string) => {
    // Parse date string directly to avoid timezone issues
    // Input format: "2023-09-17" (YYYY-MM-DD)
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day); // month is 0-indexed
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (stats.totalScored === 0) {
    return (
      <div className="dog-statistics-empty">
        <p>No scored results yet for {dogName}</p>
      </div>
    );
  }

  // Custom label for pie chart
  const renderCustomLabel = (props: unknown) => {
    // Recharts PieLabelRenderProps - cast to access our data
    const entry = props as PieChartEntry;
    if (!entry?.percentage || entry.percentage < 5) return null; // Don't show label for small segments
    return `${entry.percentage.toFixed(1)}%`;
  };

  return (
    <div className="dog-statistics">
      <h3 className="statistics-header">
        <TrendingUp size={20} />
        Performance Statistics
      </h3>

      {/* Summary Cards - Match Stats page styling */}
      <div className="stats-summary">
        <div className="stat-card">
          <div className="card-icon total">
            <BarChart3 />
          </div>
          <div className="card-content">
            <h3>Total Classes</h3>
            <div className="card-value">{stats.totalClasses}</div>
            <p className="card-subtitle">{stats.totalScored} scored</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="card-icon qualified">
            <Award />
          </div>
          <div className="card-content">
            <h3>Qualified</h3>
            <div className="card-value">{stats.qualifiedCount}</div>
            <p className="card-subtitle">{stats.qualificationRate.toFixed(1)}% Q rate</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="card-icon fastest">
            <Clock />
          </div>
          <div className="card-content">
            <h3>Fastest Time</h3>
            <div className="card-value">
              {stats.fastestTime !== null ? `${stats.fastestTime.toFixed(2)}s` : '--'}
            </div>
            {stats.fastestClassName && (
              <p className="card-subtitle">{stats.fastestClassName}</p>
            )}
          </div>
        </div>
        <div className="stat-card">
          <div className="card-icon average">
            <TrendingUp />
          </div>
          <div className="card-content">
            <h3>Avg Time</h3>
            <div className="card-value">
              {stats.averageTime !== null ? `${stats.averageTime.toFixed(2)}s` : '--'}
            </div>
          </div>
        </div>
      </div>

      {/* Charts Grid - Side by side on larger screens */}
      <div className="charts-grid">
        {/* Results Distribution Chart */}
        {stats.resultsData.length > 0 && (
          <div className="chart-section">
            <h4 className="chart-title">Results Distribution</h4>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={stats.resultsData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={renderCustomLabel}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {stats.resultsData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomPieTooltip />} />
                <Legend
                  verticalAlign="bottom"
                  height={36}
                  formatter={(value: string) => (
                    <span style={{ color: 'var(--foreground)', fontSize: '0.875rem' }}>
                      {value}
                    </span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Performance by Judge */}
        {stats.judgeData.length > 0 && (
          <div className="chart-section">
            <h4 className="chart-title">Performance by Judge</h4>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={stats.judgeData}
                margin={{
                  top: 20,
                  right: 30,
                  left: 20,
                  bottom: 80
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="displayName"
                  tick={{ fill: 'var(--muted-foreground)', fontSize: '0.75rem' }}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                  interval={0}
                />
                <YAxis
                  label={{
                    value: 'Qualification Rate (%)',
                    angle: -90,
                    position: 'insideLeft',
                    style: { fill: 'var(--muted-foreground)', fontSize: '0.875rem' }
                  }}
                  tick={{ fill: 'var(--muted-foreground)', fontSize: '0.75rem' }}
                />
                <Tooltip content={<CustomBarTooltip />} />
                <Bar dataKey="qualificationRate" fill="var(--primary)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* All Results Table */}
      <div className="results-table-section">
        <h4 className="chart-title">
          <Calendar size={18} />
          All Classes
        </h4>
        <p className="scroll-hint">
          <ArrowRight />
          Scroll horizontally to view all columns
        </p>
        <div className="results-table-container">
          <table className="results-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Class</th>
                <th>Time</th>
                <th>Faults</th>
                <th>Place</th>
                <th>Status</th>
                <th>Judge</th>
              </tr>
            </thead>
            <tbody>
              {stats.allResults.map((result) => (
                <tr
                  key={result.id}
                  className={
                    result.isScored
                      ? (result.qualified ? 'qualified-row' : 'nq-row')
                      : 'unscored-row'
                  }
                >
                  <td className="date-cell">
                    <Clock size={14} />
                    {formatDate(result.trialDate)}
                    {result.trialNumber && <span className="trial-num">T{result.trialNumber}</span>}
                  </td>
                  <td className="class-cell">{result.className}</td>
                  {result.isScored ? (
                    <>
                      <td className="time-cell">
                        {result.visibleFields?.showTime ? formatTime(result.time) : '⏳'}
                      </td>
                      <td className="faults-cell">
                        {result.visibleFields?.showFaults ? (result.faults || 0) : '⏳'}
                      </td>
                      <td className="placement-cell">
                        {result.visibleFields?.showPlacement && result.placement ? (
                          <span className="placement-badge">{result.placement}</span>
                        ) : '--'}
                      </td>
                      <td className="result-cell">
                        <span className={`result-badge ${result.qualified ? 'qualified' : 'nq'}`}>
                          {result.qualified ? 'Qualified' : 'NQ'}
                        </span>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="time-cell">--</td>
                      <td className="faults-cell">--</td>
                      <td className="placement-cell">--</td>
                      <td className="result-cell">
                        <span
                          className="status-badge"
                          style={{
                            backgroundColor: getCheckInStatusColor(result.checkInStatus),
                            color: 'white',
                            padding: 'var(--token-space-sm) var(--token-space-lg)',
                            borderRadius: 'var(--token-space-sm)',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            display: 'inline-block'
                          }}
                        >
                          {getCheckInStatusLabel(result.checkInStatus)}
                        </span>
                      </td>
                    </>
                  )}
                  <td className="judge-cell">{result.judgeName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
