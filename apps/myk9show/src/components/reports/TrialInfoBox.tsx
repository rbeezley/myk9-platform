import React from 'react';
import { formatTrialLabel } from '@myk9/core';
import { formatReportDate, isValidSection } from '@/lib/reports/reportUtils';

interface TrialInfoBoxProps {
  trial?:
    | {
        date: string;
        name?: string;
        trialNumber: string;
        judgeName: string;
      }
    | undefined;
  classData?:
    | {
        element: string;
        level: string;
        section: string;
      }
    | undefined;
}

export const TrialInfoBox: React.FC<TrialInfoBoxProps> = ({ trial, classData }) => {
  if (!trial && !classData) return null;

  return (
    <div className="trial-info-box">
      {trial?.date && (
        <div className="info-row">
          <span className="info-label">Trial Date:</span>
          <span className="info-value">{formatReportDate(trial.date)}</span>
        </div>
      )}
      {classData?.element && (
        <div className="info-row">
          <span className="info-label">Element:</span>
          <span className="info-value">{classData.element}</span>
        </div>
      )}
      {trial && (trial.name || trial.trialNumber) && (
        <div className="info-row">
          <span className="info-label">Trial:</span>
          <span className="info-value">
            {formatTrialLabel({ name: trial.name, trialNumber: trial.trialNumber })}
          </span>
        </div>
      )}
      {classData?.level && (
        <div className="info-row">
          <span className="info-label">Level:</span>
          <span className="info-value">{classData.level}</span>
        </div>
      )}
      {trial?.judgeName && (
        <div className="info-row">
          <span className="info-label">Judge:</span>
          <span className="info-value">{trial.judgeName}</span>
        </div>
      )}
      {isValidSection(classData?.section) && (
        <div className="info-row">
          <span className="info-label">Section:</span>
          <span className="info-value">{classData?.section}</span>
        </div>
      )}
    </div>
  );
};
