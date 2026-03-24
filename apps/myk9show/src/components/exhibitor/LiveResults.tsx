import React, { useState, useCallback, useMemo } from 'react';
import { logger } from '@/services/LoggingService';
import { toast } from 'sonner';
import {
  Trophy,
  Medal,
  Clock,
  CheckCircle,
  XCircle,
  TrendingUp,
  Mail,
  Share2,
  RefreshCw,
  Filter,
  PartyPopper,
} from 'lucide-react';
import { ExhibitorEntry } from '@/types/exhibitor-types';
import { cn } from '@/lib/utils';
import { shareOrCopy } from '../../utils/share';

interface LiveResultsProps {
  entries: ExhibitorEntry[];
  userEntries: ExhibitorEntry[];
  onRefresh?: () => void;
  isLive?: boolean;
}

interface PlacementInfo {
  place: number;
  color: string;
  bgColor: string;
  icon: React.ReactNode;
}

const formatSearchTime = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const hundredths = Math.floor((ms % 1000) / 10);
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${hundredths.toString().padStart(2, '0')}`;
};

const LiveResults: React.FC<LiveResultsProps> = ({
  entries,
  userEntries,
  onRefresh,
  isLive = true,
}) => {
  const [sortBy, setSortBy] = useState<'placement' | 'armband'>('placement');
  const [filterQualified, setFilterQualified] = useState(false);
  const [highlightUser] = useState(true);

  // Sort entries based on results
  const sortedEntries = useMemo(
    () =>
      [...entries].sort((a, b) => {
        if (sortBy === 'armband') {
          return parseInt(a.armband) - parseInt(b.armband);
        }

        // Sort by placement
        if (!a.result && !b.result) return 0;
        if (!a.result) return 1;
        if (!b.result) return -1;

        if (a.result.placement && b.result.placement) {
          return parseInt(a.result.placement) - parseInt(b.result.placement);
        }

        // If no placement, sort by qualification then time
        const aQualified = a.result.qualified ?? false;
        const bQualified = b.result.qualified ?? false;
        if (aQualified !== bQualified) {
          return aQualified ? -1 : 1;
        }

        const aTime = a.result.searchTime || 0;
        const bTime = b.result.searchTime || 0;
        return aTime - bTime;
      }),
    [entries, sortBy]
  );

  // Filter if needed
  const displayEntries = useMemo(
    () =>
      filterQualified ? sortedEntries.filter(e => e.result?.qualified !== false) : sortedEntries,
    [sortedEntries, filterQualified]
  );

  // Get placement info
  const getPlacementInfo = (place: string | undefined): PlacementInfo | null => {
    if (!place) return null;

    const placeNum = parseInt(place);
    switch (placeNum) {
      case 1:
        return {
          place: 1,
          color: 'text-purple-600 dark:text-purple-400',
          bgColor: 'bg-purple-100 dark:bg-purple-900/30',
          icon: <Trophy className="w-5 h-5" />,
        };
      case 2:
        return {
          place: 2,
          color: 'text-red-600 dark:text-red-400',
          bgColor: 'bg-red-100 dark:bg-red-900/30',
          icon: <Medal className="w-5 h-5" />,
        };
      case 3:
        return {
          place: 3,
          color: 'text-yellow-600 dark:text-yellow-400',
          bgColor: 'bg-yellow-100 dark:bg-yellow-900/30',
          icon: <Medal className="w-5 h-5" />,
        };
      case 4:
        return {
          place: 4,
          color: 'text-gray-600 dark:text-gray-400',
          bgColor: 'bg-gray-100 dark:bg-gray-900/30',
          icon: <span className="text-lg font-bold">4</span>,
        };
      default:
        return null;
    }
  };

  // Check if user has qualified for title
  const checkTitleProgress = () => {
    const qualifiedEntries = userEntries.filter(e => e.result?.qualified);
    return {
      qualified: qualifiedEntries.length,
      total: userEntries.length,
      needsMore: 3 - qualifiedEntries.length, // Assuming 3 legs needed
    };
  };

  const titleProgress = checkTitleProgress();
  const hasResults = entries.some(e => e.result);

  const buildResultsSummary = useCallback(() => {
    const className = entries[0]?.className || 'Results';
    const lines = [`${className} - Preliminary Results\n`];

    for (const entry of sortedEntries) {
      if (!entry.result) continue;
      const qualified = entry.result.qualified !== false ? 'Q' : 'NQ';
      const placement = entry.result.placement ? `#${entry.result.placement} ` : '';
      const time = entry.result.searchTime ? ` ${formatSearchTime(entry.result.searchTime)}` : '';
      const isUser = userEntries.some(ue => ue.id === entry.id);
      const marker = isUser ? ' *' : '';
      lines.push(
        `${placement}${entry.armband} ${entry.dog?.callName || entry.dogCallName} (${qualified}${time})${marker}`
      );
    }

    return lines.join('\n');
  }, [entries, sortedEntries, userEntries]);

  const handleEmailResults = useCallback(() => {
    const className = entries[0]?.className || 'Results';
    const body = buildResultsSummary();
    const subject = encodeURIComponent(`${className} - Preliminary Results`);
    const encodedBody = encodeURIComponent(body);
    window.open(`mailto:?subject=${subject}&body=${encodedBody}`, '_self');
    logger.debug('Email results', 'components', {});
  }, [entries, buildResultsSummary]);

  const handleShareResults = useCallback(async () => {
    const text = buildResultsSummary();
    try {
      const result = await shareOrCopy({
        title: entries[0]?.className || 'Results',
        text,
        url: window.location.href,
        clipboardText: text,
      });
      if (result === 'copied') {
        toast.success('Results copied to clipboard');
      }
    } catch {
      toast.error('Unable to share results');
    }
    logger.debug('Share results', 'components', {});
  }, [entries, buildResultsSummary]);

  return (
    <div className="max-w-lg mx-auto p-4 pb-20">
      {/* Header */}
      <div className="bg-card dark:bg-gray-800 rounded-lg shadow-sm p-6 mb-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              {entries[0]?.className || 'Results'}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              {isLive && (
                <span className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
                  <div className="w-2 h-2 bg-green-600 dark:bg-green-400 rounded-full animate-pulse" />
                  Live
                </span>
              )}
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {hasResults ? 'Preliminary Results' : 'Waiting for results...'}
              </span>
            </div>
          </div>
          <button
            onClick={onRefresh}
            className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
            <button
              onClick={() => setSortBy('placement')}
              className={cn(
                'px-3 py-1 rounded text-sm font-medium transition-colors',
                sortBy === 'placement'
                  ? 'bg-card dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400'
              )}
            >
              Placement
            </button>
            <button
              onClick={() => setSortBy('armband')}
              className={cn(
                'px-3 py-1 rounded text-sm font-medium transition-colors',
                sortBy === 'armband'
                  ? 'bg-card dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400'
              )}
            >
              Armband
            </button>
          </div>
          <button
            onClick={() => setFilterQualified(!filterQualified)}
            className={cn(
              'flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
              filterQualified
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
            )}
          >
            <Filter className="w-4 h-4" />Q Only
          </button>
        </div>
      </div>

      {/* Title Progress for User */}
      {titleProgress.qualified > 0 && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <div>
                <div className="font-medium text-blue-800 dark:text-blue-200">Title Progress</div>
                <div className="text-sm text-blue-600 dark:text-blue-400 flex items-center gap-1">
                  {titleProgress.needsMore > 0 ? (
                    `${titleProgress.needsMore} more leg${titleProgress.needsMore === 1 ? '' : 's'} needed`
                  ) : (
                    <>
                      <span>Title completed!</span>{' '}
                      <PartyPopper className="h-4 w-4 text-yellow-500" />
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">
              {titleProgress.qualified}/3
            </div>
          </div>
        </div>
      )}

      {/* Results List */}
      {hasResults ? (
        <div className="space-y-2">
          {displayEntries.map(entry => {
            const isUser = userEntries.some(ue => ue.id === entry.id);
            const placement = getPlacementInfo(entry.result?.placement);
            const result = entry.result;

            return (
              <div
                key={entry.id}
                className={cn(
                  'bg-card dark:bg-gray-800 rounded-lg shadow-sm p-4 transition-all',
                  isUser && highlightUser && 'ring-2 ring-blue-500 dark:ring-blue-400'
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    {/* Placement Badge */}
                    {placement && (
                      <div
                        className={cn(
                          'flex items-center justify-center w-10 h-10 rounded-full',
                          placement.bgColor
                        )}
                      >
                        <div className={placement.color}>{placement.icon}</div>
                      </div>
                    )}

                    {/* Entry Info */}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xl font-bold text-gray-900 dark:text-gray-100">
                          #{entry.armband}
                        </span>
                        {isUser && (
                          <span className="px-2 py-0.5 bg-blue-600 dark:bg-blue-500 text-white text-xs font-medium rounded">
                            YOUR DOG
                          </span>
                        )}
                      </div>
                      <div className="text-gray-700 dark:text-gray-300 font-medium">
                        {entry.dog?.callName || entry.dogCallName}
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        {entry.handlerName} • {entry.breed}
                      </div>
                    </div>
                  </div>

                  {/* Result Info */}
                  {result && (
                    <div className="text-right">
                      {result.qualified !== false ? (
                        <div className="flex items-center gap-1 text-green-600 dark:text-green-400 mb-1">
                          <CheckCircle className="w-4 h-4" />
                          <span className="font-medium">Q</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-red-600 dark:text-red-400 mb-1">
                          <XCircle className="w-4 h-4" />
                          <span className="font-medium">NQ</span>
                        </div>
                      )}
                      {result.searchTime && (
                        <div className="flex items-center gap-1 text-gray-700 dark:text-gray-300">
                          <Clock className="w-4 h-4" />
                          <span className="font-mono">{formatSearchTime(result.searchTime)}</span>
                        </div>
                      )}
                      {result.faults && result.faults > 0 && (
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          {result.faults} fault{result.faults !== 1 ? 's' : ''}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Special celebration for user placements */}
                {isUser && placement && placement.place <= 3 && (
                  <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                    <div className="text-center text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center justify-center gap-2">
                      <PartyPopper className="h-5 w-5 text-yellow-500" />
                      Congratulations!
                      <PartyPopper className="h-5 w-5 text-yellow-500" />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-8 text-center">
          <Trophy className="w-12 h-12 mx-auto mb-4 text-gray-400 dark:text-gray-600" />
          <div className="text-gray-600 dark:text-gray-400 mb-2">No results posted yet</div>
          <div className="text-sm text-gray-500 dark:text-gray-500">
            Results will appear here as soon as they're available
          </div>
        </div>
      )}

      {/* Action Buttons */}
      {hasResults && (
        <div className="mt-6 space-y-3">
          <button
            onClick={handleEmailResults}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 dark:bg-blue-500 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors"
          >
            <Mail className="w-5 h-5" />
            Email Results
          </button>
          <button
            onClick={handleShareResults}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            <Share2 className="w-5 h-5" />
            Share Results
          </button>
        </div>
      )}

      {/* Note about official results */}
      {hasResults && (
        <div className="mt-4 text-center text-sm text-gray-500 dark:text-gray-500">
          Official results will be available in approximately 30 minutes
        </div>
      )}
    </div>
  );
};

export default LiveResults;
