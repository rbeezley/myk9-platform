import React from 'react';
import { Crown } from 'lucide-react';

interface DogTabNavigationProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
}

const tabs = [
  { key: 'basic-info', label: 'Basic Information' },
  { key: 'pedigree', label: 'Pedigree', premium: true },
  { key: 'registrations', label: 'Registrations' },
  { key: 'health', label: 'Health Records', premium: true },
  { key: 'competitions', label: 'Competitions', premium: true },
  { key: 'titles', label: 'Title Tracking', premium: true },
  { key: 'training', label: 'Training Journal', premium: true },
];

const DogTabNavigation: React.FC<DogTabNavigationProps> = ({ activeSection, onSectionChange }) => (
  <div className="sticky top-16 z-40 bg-white border-b border-gray-200 shadow-sm">
    <div className="container px-4 mx-auto">
      <div className="flex items-center space-x-6 overflow-x-auto py-4 no-scrollbar">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => onSectionChange(tab.key)}
            className={`whitespace-nowrap cursor-pointer px-3 py-2 rounded-md transition-colors ${activeSection === tab.key ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            {tab.label}
            {tab.premium && (
              <Crown className="inline-block ml-1 text-yellow-500 align-text-bottom" size={16} aria-label="Premium" />
            )}
          </button>
        ))}
      </div>
    </div>
  </div>
);

export default DogTabNavigation;
