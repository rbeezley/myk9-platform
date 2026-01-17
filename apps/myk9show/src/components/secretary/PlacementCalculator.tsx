/**
 * Placement Calculator Component
 * 
 * Calculates and displays placements for Scent Work classes according to AKC rules:
 * - Only Qualified entries receive placements
 * - Ranked by total search time (fastest first)
 * - Faults are a tiebreaker only for equal times
 * - Multi-area classes use total time across all areas
 */

import { useState, useCallback, useMemo } from 'react';
import { Calculator, Award, RefreshCw, Eye, Download } from 'lucide-react';
import { cn } from '@/lib/utils';

// UI Components
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';

// Types
import type { 
  ScentWorkEntry, 
  ScentWorkResult, 
  MultiAreaScentWorkResult,
  ScentWorkClassConfig 
} from '@/types/scent-work-types';
import { msToDisplay } from '@/lib/timeUtils';

export interface PlacementCalculatorProps {
  entries: ScentWorkEntry[];
  results: Map<string, ScentWorkResult | MultiAreaScentWorkResult>;
  classConfig: ScentWorkClassConfig;
  onRecalculate: () => Promise<void>;
  isCalculating: boolean;
  className?: string;
}

interface PlacementEntry {
  entryId: string;
  armband: string;
  dogName: string;
  handlerName: string;
  searchTime: number;
  faults: number;
  qualification: string;
  placement?: number;
  tieStatus?: 'winner' | 'tied';
  isQualified: boolean;
}

/**
 * Placement calculation utility component
 */
export function PlacementCalculator({
  entries,
  results,
  classConfig,
  onRecalculate,
  isCalculating,
  className
}: PlacementCalculatorProps) {
  const [showAllEntries, setShowAllEntries] = useState(false);

  // Process entries and calculate placements
  const placementData = useMemo(() => {
    const entryData: PlacementEntry[] = entries.map(entry => {
      const result = results.get(entry.id);
      
      if (!result) {
        return {
          entryId: entry.id,
          armband: entry.displayInfo.armband,
          dogName: entry.displayInfo.dogName,
          handlerName: entry.displayInfo.handlerName,
          searchTime: 0,
          faults: 0,
          qualification: 'No Result',
          isQualified: false
        };
      }

      const searchTime = 'totalSearchTime' in result ? result.totalSearchTime : result.searchTime;
      const faults = 'totalFaults' in result ? result.totalFaults : result.faults;
      const isQualified = result.qualification === 'Qualified';

      return {
        entryId: entry.id,
        armband: entry.displayInfo.armband,
        dogName: entry.displayInfo.dogName,
        handlerName: entry.displayInfo.handlerName,
        searchTime,
        faults,
        qualification: result.qualification,
        isQualified
      };
    });

    // Calculate placements for qualified entries only
    const qualifiedEntries = entryData.filter(entry => entry.isQualified);
    
    // Sort by search time (fastest first), then by faults (fewest first)
    qualifiedEntries.sort((a, b) => {
      if (a.searchTime !== b.searchTime) {
        return a.searchTime - b.searchTime;
      }
      return a.faults - b.faults;
    });

    // Assign placements, handling ties
    let currentPlacement = 1;
    let lastTime = -1;
    let lastFaults = -1;
    let tiedEntries: PlacementEntry[] = [];

    qualifiedEntries.forEach((entry, index) => {
      if (entry.searchTime !== lastTime || entry.faults !== lastFaults) {
        // New time/fault combination - assign new placement
        if (tiedEntries.length > 1) {
          // Mark previous tied entries
          tiedEntries.forEach(tied => {
            tied.tieStatus = 'tied';
          });
        } else if (tiedEntries.length === 1) {
          tiedEntries[0].tieStatus = 'winner';
        }
        
        currentPlacement = index + 1;
        tiedEntries = [entry];
      } else {
        // Same time and faults - tied
        tiedEntries.push(entry);
      }
      
      entry.placement = currentPlacement;
      lastTime = entry.searchTime;
      lastFaults = entry.faults;
    });

    // Handle final tie group
    if (tiedEntries.length > 1) {
      tiedEntries.forEach(tied => {
        tied.tieStatus = 'tied';
      });
    } else if (tiedEntries.length === 1) {
      tiedEntries[0].tieStatus = 'winner';
    }

    return entryData;
  }, [entries, results]);

  // Filter data based on view mode
  const displayData = useMemo(() => {
    if (showAllEntries) {
      return placementData;
    }
    return placementData.filter(entry => entry.isQualified);
  }, [placementData, showAllEntries]);

  // Calculate statistics
  const stats = useMemo(() => {
    const totalEntries = placementData.length;
    const qualifiedEntries = placementData.filter(entry => entry.isQualified).length;
    const withResults = placementData.filter(entry => entry.qualification !== 'No Result').length;
    const placedEntries = placementData.filter(entry => entry.placement).length;

    return {
      totalEntries,
      qualifiedEntries,
      withResults,
      placedEntries,
      percentComplete: totalEntries > 0 ? Math.round((withResults / totalEntries) * 100) : 0
    };
  }, [placementData]);

  // Export placements to CSV
  const exportPlacements = useCallback(() => {
    const csvData = [
      ['Placement', 'Armband', 'Dog Name', 'Handler', 'Time', 'Faults', 'Qualification'],
      ...displayData.map(entry => [
        entry.placement || '',
        entry.armband,
        entry.dogName,
        entry.handlerName,
        entry.searchTime > 0 ? msToDisplay(entry.searchTime, 'hundredths') : '',
        entry.faults,
        entry.qualification
      ])
    ];

    const csvContent = csvData.map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `placements-${classConfig.element}-${classConfig.level}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [displayData, classConfig]);

  // Render placement badge
  const renderPlacementBadge = (placement?: number, tieStatus?: string) => {
    if (!placement) return null;

    const colors = {
      1: 'bg-yellow-500 text-white',
      2: 'bg-gray-400 text-white', 
      3: 'bg-amber-600 text-white',
      4: 'bg-blue-500 text-white'
    };

    const bgClass = colors[placement as keyof typeof colors] || 'bg-gray-300 text-gray-700';
    const suffix = placement === 1 ? 'st' : placement === 2 ? 'nd' : placement === 3 ? 'rd' : 'th';
    
    return (
      <div className="flex items-center space-x-1">
        <Badge className={cn('text-xs font-bold', bgClass)}>
          {placement}{suffix}
        </Badge>
        {tieStatus === 'tied' && (
          <Badge variant="outline" className="text-xs">
            Tied
          </Badge>
        )}
      </div>
    );
  };

  // Render qualification badge
  const renderQualificationBadge = (qualification: string) => {
    const variants = {
      'Qualified': 'default',
      'Not Qualified': 'destructive',
      'Absent': 'secondary',
      'Excused': 'outline',
      'Withdrawn': 'outline',
      'No Result': 'outline'
    } as const;

    return (
      <Badge variant={variants[qualification as keyof typeof variants] || 'outline'}>
        {qualification}
      </Badge>
    );
  };

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Placement Calculator</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            AKC Scent Work placement calculation based on search time and faults
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <Button
            variant="outline"
            onClick={() => setShowAllEntries(!showAllEntries)}
            className="flex items-center space-x-2"
          >
            <Eye className="h-4 w-4" />
            <span>{showAllEntries ? 'Show Qualified Only' : 'Show All Entries'}</span>
          </Button>

          <Button
            variant="outline"
            onClick={exportPlacements}
            disabled={stats.placedEntries === 0}
            className="flex items-center space-x-2"
          >
            <Download className="h-4 w-4" />
            <span>Export</span>
          </Button>

          <Button
            onClick={onRecalculate}
            disabled={isCalculating}
            className="flex items-center space-x-2"
          >
            <Calculator className="h-4 w-4" />
            <span>{isCalculating ? 'Calculating...' : 'Recalculate'}</span>
          </Button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Award className="h-6 w-6 text-blue-600" />
              <div>
                <p className="text-xl font-bold">{stats.totalEntries}</p>
                <p className="text-sm text-gray-600">Total Entries</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <RefreshCw className="h-6 w-6 text-green-600" />
              <div>
                <p className="text-xl font-bold">{stats.withResults}</p>
                <p className="text-sm text-gray-600">With Results</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Award className="h-6 w-6 text-yellow-600" />
              <div>
                <p className="text-xl font-bold">{stats.qualifiedEntries}</p>
                <p className="text-sm text-gray-600">Qualified</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Calculator className="h-6 w-6 text-purple-600" />
              <div>
                <p className="text-xl font-bold">{stats.placedEntries}</p>
                <p className="text-sm text-gray-600">Placed</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Placement Rules Info */}
      <Alert>
        <Calculator className="h-4 w-4" />
        <AlertDescription>
          <strong>AKC Placement Rules:</strong> Only Qualified entries receive placements. 
          Ranked by total search time (fastest first). Faults are used as tiebreaker for identical times.
          {classConfig.multiArea && ' Multi-area classes use total time across all areas.'}
        </AlertDescription>
      </Alert>

      {/* Placement Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>
              {showAllEntries ? 'All Entries' : 'Qualified Entries'} 
              ({displayData.length})
            </span>
            <Badge variant="outline">
              {stats.percentComplete}% Results Complete
            </Badge>
          </CardTitle>
          <CardDescription>
            Placement calculation based on current results
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Placement</TableHead>
                <TableHead>Armband</TableHead>
                <TableHead>Dog & Handler</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Faults</TableHead>
                <TableHead>Result</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayData.map((entry) => (
                <TableRow 
                  key={entry.entryId}
                  className={cn(
                    'hover:bg-gray-50 dark:hover:bg-gray-800',
                    !entry.isQualified && 'opacity-60'
                  )}
                >
                  <TableCell>
                    {renderPlacementBadge(entry.placement, entry.tieStatus)}
                  </TableCell>
                  <TableCell className="font-medium">
                    #{entry.armband}
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">{entry.dogName}</div>
                      <div className="text-sm text-gray-600">{entry.handlerName}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {entry.searchTime > 0 ? (
                      <span className="font-mono">
                        {msToDisplay(entry.searchTime, 'hundredths')}
                      </span>
                    ) : (
                      <span className="text-gray-400">--:--</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {entry.qualification !== 'No Result' ? entry.faults : '--'}
                  </TableCell>
                  <TableCell>
                    {renderQualificationBadge(entry.qualification)}
                  </TableCell>
                </TableRow>
              ))}

              {displayData.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                    {showAllEntries ? 'No entries found' : 'No qualified entries yet'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}