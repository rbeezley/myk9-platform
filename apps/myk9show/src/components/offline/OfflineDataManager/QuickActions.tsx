/**
 * QuickActions - Grid of quick-access action cards for the overview tab
 */

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, Archive, Trash2 } from 'lucide-react';

interface QuickActionsProps {
  onNavigateToTab: (tab: string) => void;
}

export function QuickActions({ onNavigateToTab }: QuickActionsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card className="border-2 border-dashed border-muted hover:border-primary/50 transition-colors">
        <CardContent className="flex flex-col items-center justify-center p-6 text-center">
          <Download className="h-8 w-8 text-primary mb-2" />
          <h3 className="font-medium mb-1">Export Data</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Export your data in various formats
          </p>
          <Button size="sm" onClick={() => onNavigateToTab('export')}>
            Start Export
          </Button>
        </CardContent>
      </Card>

      <Card className="border-2 border-dashed border-muted hover:border-primary/50 transition-colors">
        <CardContent className="flex flex-col items-center justify-center p-6 text-center">
          <Archive className="h-8 w-8 text-primary mb-2" />
          <h3 className="font-medium mb-1">Create Backup</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Create a backup of your data
          </p>
          <Button size="sm" onClick={() => onNavigateToTab('backup')}>
            Create Backup
          </Button>
        </CardContent>
      </Card>

      <Card className="border-2 border-dashed border-muted hover:border-primary/50 transition-colors">
        <CardContent className="flex flex-col items-center justify-center p-6 text-center">
          <Trash2 className="h-8 w-8 text-primary mb-2" />
          <h3 className="font-medium mb-1">Manage Data</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Clear or organize your data
          </p>
          <Button size="sm" onClick={() => onNavigateToTab('manage')}>
            Manage Data
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
