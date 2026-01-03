import React from 'react';
import { Users, CheckCircle, Target, Clock } from 'lucide-react';
import { EntryData } from './types/classTypes';

interface ClassStatisticsProps {
  classEntries: EntryData[];
}

const calcStats = (entries: EntryData[]) => {
  const total = entries.length;
  const qualified = entries.filter(e => e.status === 'Qualified');
  const notQualified = entries.filter(e => e.status === 'Not Qualified');
  const avgScore = entries.length ? (
    entries.reduce((sum, e) => sum + parseFloat(e.score), 0) / entries.length
  ).toFixed(1) : '0';
  const avgTime = entries.length ? (
    entries.reduce((sum, e) => sum + (parseFloat(e.time.replace(':', '.')) || 0), 0) / entries.length
  ).toFixed(2) : '0';
  
  const qualificationRate = total ? ((qualified.length / total) * 100) : 0;
  
  return {
    total,
    qualified: qualified.length,
    notQualified: notQualified.length,
    avgScore,
    avgTime,
    qualificationRate: qualificationRate.toFixed(0),
    qualificationProgress: Math.min(qualificationRate, 100)
  };
};

const ClassStatistics: React.FC<ClassStatisticsProps> = ({ classEntries }) => {
  const stats = calcStats(classEntries);
  
  const statCards = [
    {
      title: 'Total Entries',
      value: stats.total,
      details: `${stats.qualified} qualified, ${stats.notQualified} NQ`,
      icon: Users,
      type: 'entries',
      progress: stats.total > 0 ? Math.min((stats.total / 20) * 100, 100) : 0 // Assume max 20 entries
    },
    {
      title: 'Qualified',
      value: stats.qualified,
      details: `${stats.qualificationRate}% rate`,
      icon: CheckCircle,
      type: 'qualified',
      progress: stats.qualificationProgress
    },
    {
      title: 'Avg Score',
      value: stats.avgScore === '0' ? '--' : stats.avgScore,
      details: 'Out of 100 points',
      icon: Target,
      type: 'score',
      progress: stats.avgScore !== '0' ? parseFloat(stats.avgScore) : 0
    },
    {
      title: 'Avg Time',
      value: stats.avgTime === '0.00' ? '--' : `${stats.avgTime}s`,
      details: 'Average completion',
      icon: Clock,
      type: 'time',
      progress: stats.avgTime !== '0.00' ? Math.min((parseFloat(stats.avgTime) / 180) * 100, 100) : 0 // Assume 3 min max
    }
  ];

  return (
    <div className="apple-class-stats-grid">
      {statCards.map((card) => {
        const IconComponent = card.icon;
        return (
          <div key={card.type} className="apple-class-stat-card">
            <div className="apple-class-stat-layout">
              <div className={`apple-class-stat-icon ${card.type}`}>
                <IconComponent className="h-5 w-5" />
              </div>
              <div className="apple-class-stat-content">
                <div className="apple-class-stat-title">{card.title}</div>
                <div className="apple-class-stat-number">{card.value}</div>
              </div>
            </div>
            <div className="apple-class-stat-details">
              <span>{card.details}</span>
              <span className="apple-show-stat-trend">
                +{Math.floor(Math.random() * 15)}%
              </span>
            </div>
            <div className="apple-class-stat-progress">
              <div 
                className={`apple-class-stat-progress-bar ${card.type}`}
                style={{ width: `${card.progress}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ClassStatistics;
