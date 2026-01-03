import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Trial } from '../types/trial.types';
import { TrialListItem } from './TrialListItem';

interface TrialListProps {
  trials: Trial[];
  selectedTrialId: string | null;
  onSelectTrial: (id: string) => void;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  searchTerm: string;
  onSearchChange: (term: string) => void;
}

export const TrialList = ({
  trials,
  selectedTrialId,
  onSelectTrial,
  isSidebarOpen,
  onToggleSidebar,
  searchTerm,
  onSearchChange,
}: TrialListProps) => {
  const filteredTrials = trials.filter(
    (trial) =>
      trial.showName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      trial.trialNumber.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className={`bg-white border-r border-gray-200 transition-all duration-300 ${
      isSidebarOpen ? 'w-80' : 'w-16'
    }`}>
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          {isSidebarOpen && (
            <Input
              type="text"
              placeholder="Search trials..."
              value={""}
              onChange={(e) => onSearchChange(e.target.value)}
              className="flex-1 mr-2"
            />
          )}
          <Button
            variant="ghost"
            size="icon"
            className="!rounded-full w-8 h-8"
            onClick={onToggleSidebar}
          >
            <i className={`fas fa-chevron-${isSidebarOpen ? 'left' : 'right'}`}></i>
          </Button>
        </div>
      </div>
      <div className="overflow-y-auto h-[calc(100vh-73px)]">
        {isSidebarOpen &&
          filteredTrials.map((trial) => (
            <TrialListItem
              key={trial.id}
              trial={trial}
              isSelected={selectedTrialId === trial.id}
              onSelect={onSelectTrial}
            />
          ))}
      </div>
    </div>
  );
}
