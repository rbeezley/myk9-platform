import { Button } from '@/components/ui/button';
import { RotateCcw, Trash2, Bomb } from 'lucide-react';
import { resetAllMockData, resetEverything, resetSpecificStore } from '@/utils/debugUtils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * Development component for resetting mock data
 * Only shown in development mode
 */
export function ResetDataButton() {
  // Only show in development
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  const handleResetAll = () => {
    if (confirm('Reset all data (preserves templates & UI preferences)? This will reload the page.')) {
      resetAllMockData();
    }
  };

  const handleResetEverything = async () => {
    if (confirm('NUCLEAR RESET: This will clear ALL data including templates and UI preferences. Are you sure?')) {
      await resetEverything();
    }
  };

  const handleResetStore = (storeName: string) => {
    if (confirm(`Reset ${storeName} store data?`)) {
      resetSpecificStore(storeName);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <RotateCcw className="h-4 w-4" />
          Reset Data
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={handleResetAll} className="gap-2 text-orange-600">
          <Trash2 className="h-4 w-4" />
          Reset Data Only
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleResetEverything} className="gap-2 text-red-600">
          <Bomb className="h-4 w-4" />
          Reset Everything
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => handleResetStore('dogs')} className="gap-2">
          <RotateCcw className="h-4 w-4" />
          Reset Dogs
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleResetStore('people')} className="gap-2">
          <RotateCcw className="h-4 w-4" />
          Reset Users
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleResetStore('shows')} className="gap-2">
          <RotateCcw className="h-4 w-4" />
          Reset Shows
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleResetStore('clubs')} className="gap-2">
          <RotateCcw className="h-4 w-4" />
          Reset Clubs
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleResetStore('health')} className="gap-2">
          <RotateCcw className="h-4 w-4" />
          Reset Health Records
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleResetStore('templates')} className="gap-2">
          <RotateCcw className="h-4 w-4" />
          Reset Templates
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleResetStore('trials')} className="gap-2">
          <RotateCcw className="h-4 w-4" />
          Reset Trials
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleResetStore('classes')} className="gap-2">
          <RotateCcw className="h-4 w-4" />
          Reset Classes
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleResetStore('entries')} className="gap-2">
          <RotateCcw className="h-4 w-4" />
          Reset Entries
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}