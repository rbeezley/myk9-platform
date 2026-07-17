import { Trial } from '../types/trial.types';
import { deriveTrialStatusKey } from '@myk9/core';
import { StatusBadge } from '@/components/status';

interface TrialListItemProps {
  trial: Trial;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

export const TrialListItem = ({ trial, isSelected, onSelect }: TrialListItemProps) => (
  <div
    className={`p-4 border-b border-gray-200 cursor-pointer hover:bg-gray-50 ${
      isSelected ? 'bg-blue-50' : ''
    }`}
    onClick={() => onSelect(trial.id)}
  >
    <h3 className="font-medium text-gray-900 mb-1">{trial.showName}</h3>
    <div className="text-sm text-gray-500 space-y-1">
      <div className="flex items-center">
        <i className="fas fa-calendar-alt w-4 mr-2"></i>
        {trial.trialDate}
      </div>
      <div className="flex items-center">
        <i className="fas fa-hashtag w-4 mr-2"></i>
        {trial.trialNumber}
      </div>
    </div>
    <StatusBadge
      family="trial"
      status={deriveTrialStatusKey({ trialStatus: trial.status, classCount: 1 })}
      className="mt-2 border border-border bg-muted/40"
    />
  </div>
);
