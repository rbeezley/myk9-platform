import React, { useEffect, useState, startTransition } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, ChevronRight, AlertCircle, Coffee, Users, Timer, Bell } from 'lucide-react';
import { RingStatus, ExhibitorEntry } from '@/types/exhibitor-types';
import { formatRingLabel } from '@/utils/ringLabel';

interface RingMonitorProps {
  userEntry: ExhibitorEntry;
  ringStatus: RingStatus;
  onRefresh?: () => void;
}

const RingMonitor: React.FC<RingMonitorProps> = ({ userEntry, ringStatus, onRefresh }) => {
  const navigate = useNavigate();
  const [elapsedTime, setElapsedTime] = useState(0);

  // Derive user on deck and next status from props during render
  const userPosition = ringStatus.onDeck.findIndex(entry => entry.armband === userEntry.armband);
  const isUserOnDeck = userPosition !== -1;
  const isUserNext = userPosition === 0;

  // Update elapsed time for current dog
  useEffect(() => {
    if (ringStatus.currentDog && !ringStatus.isPaused) {
      const interval = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);
      return () => clearInterval(interval);
    }
    return undefined;
  }, [ringStatus.currentDog, ringStatus.isPaused]);

  // Calculate estimated time until user's turn
  const calculateEstimatedTime = () => {
    if (!ringStatus.currentDog || !ringStatus.userPosition || ringStatus.userPosition <= 0)
      return null;

    const avgTimePerDog = 120; // 2 minutes average
    const dogsAhead = ringStatus.userPosition - 1;
    const estimatedSeconds = dogsAhead * avgTimePerDog;

    return {
      minutes: Math.floor(estimatedSeconds / 60),
      formatted: formatTimeEstimate(estimatedSeconds),
    };
  };

  const formatTimeEstimate = (seconds: number) => {
    if (seconds < 60) return 'Less than 1 minute';
    const minutes = Math.floor(seconds / 60);
    if (minutes === 1) return '~1 minute';
    if (minutes < 5) return `~${minutes} minutes`;
    if (minutes < 10) return '5-10 minutes';
    if (minutes < 20) return '10-20 minutes';
    return '20+ minutes';
  };

  const formatElapsedTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const estimatedTime = calculateEstimatedTime();
  const ringLabel = formatRingLabel(ringStatus.ringNumber);

  return (
    <div className="max-w-lg mx-auto p-4 pb-20">
      {/* Header */}
      <div className="bg-card dark:bg-warm-900 rounded-lg shadow-sm p-6 mb-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            {ringLabel ? `${ringStatus.className} - ${ringLabel}` : ringStatus.className}
          </h2>
          <button
            onClick={onRefresh}
            className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
          >
            <Timer className="w-5 h-5" />
          </button>
        </div>
        <div className="text-sm text-gray-600 dark:text-gray-400">
          Judge: {ringStatus.judgeName}
        </div>
      </div>

      {/* Ring Status */}
      {ringStatus.isPaused && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-4">
          <div className="flex items-center gap-3">
            <Coffee className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
            <div>
              <div className="font-medium text-yellow-800 dark:text-yellow-200">Ring Paused</div>
              <div className="text-sm text-yellow-600 dark:text-yellow-400">
                {ringStatus.pauseReason || 'Judge break'}
              </div>
            </div>
          </div>
        </div>
      )}

      {ringStatus.delayMinutes && ringStatus.delayMinutes > 0 && (
        <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4 mb-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-orange-600 dark:text-orange-400" />
            <div>
              <div className="font-medium text-orange-800 dark:text-orange-200">Ring Delayed</div>
              <div className="text-sm text-orange-600 dark:text-orange-400">
                Running approximately {ringStatus.delayMinutes} minutes behind schedule
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Now in Ring */}
      <div className="bg-card dark:bg-warm-900 rounded-lg shadow-sm mb-4">
        <div className="border-b border-gray-200 dark:border-warm-600 px-6 py-3">
          <div className="flex items-center gap-2 text-destructive font-medium">
            <div className="w-2 h-2 bg-destructive rounded-full animate-pulse" />
            NOW IN RING
          </div>
        </div>
        {ringStatus.currentDog ? (
          <div className="p-6">
            <div className="flex items-center justify-between mb-2">
              <div className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                #{ringStatus.currentDog.armband}
              </div>
              <div className="text-lg text-gray-600 dark:text-gray-400">
                {formatElapsedTime(elapsedTime)}
              </div>
            </div>
            <div className="text-lg font-medium text-gray-800 dark:text-gray-200 mb-1">
              {ringStatus.currentDog.dogName}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {ringStatus.currentDog.breed} • {ringStatus.currentDog.handlerName}
            </div>
          </div>
        ) : (
          <div className="p-6 text-center text-gray-500 dark:text-gray-400">
            Waiting for first dog to enter ring
          </div>
        )}
      </div>

      {/* On Deck */}
      <div className="bg-card dark:bg-warm-900 rounded-lg shadow-sm mb-4">
        <div className="border-b border-gray-200 dark:border-warm-600 px-6 py-3">
          <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300 font-medium">
            <Users className="w-5 h-5" />
            ON DECK
          </div>
        </div>
        <div className="divide-y divide-gray-200 dark:divide-warm-600">
          {ringStatus.onDeck.length > 0 ? (
            ringStatus.onDeck.slice(0, 3).map((entry, index) => {
              const isUser = entry.armband === userEntry.armband;
              return (
                <div
                  key={entry.armband}
                  className={`p-4 ${isUser ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={`text-2xl font-bold ${
                          isUser
                            ? 'text-blue-600 dark:text-blue-400'
                            : 'text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        #{entry.armband}
                      </div>
                      {isUser && (
                        <div className="px-2 py-1 bg-blue-600 dark:bg-blue-500 text-white text-xs font-medium rounded">
                          YOU
                        </div>
                      )}
                    </div>
                    {index === 0 && (
                      <div className="text-sm text-gray-600 dark:text-gray-400">Next up</div>
                    )}
                  </div>
                  <div className="mt-1">
                    <div className="font-medium text-gray-800 dark:text-gray-200">
                      {entry.dogName}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      {entry.handlerName}
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-6 text-center text-gray-500 dark:text-gray-400">
              No dogs currently on deck
            </div>
          )}
        </div>
      </div>

      {/* User Status Alert */}
      {isUserNext && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-6 mb-4">
          <div className="flex items-center gap-3 mb-3">
            <Bell className="w-6 h-6 text-destructive animate-bounce" />
            <div className="text-xl font-bold text-destructive ">YOU'RE NEXT!</div>
          </div>
          <div className="text-destructive ">
            {ringLabel
              ? `Please proceed to ${ringLabel} immediately`
              : 'Please proceed immediately'}
          </div>
        </div>
      )}

      {isUserOnDeck && !isUserNext && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-6 mb-4">
          <div className="flex items-center gap-3 mb-3">
            <AlertCircle className="w-6 h-6 text-amber-600 dark:text-amber-400" />
            <div className="text-xl font-bold text-amber-800 dark:text-amber-200">GET READY!</div>
          </div>
          <div className="text-amber-700 dark:text-amber-300">
            {ringLabel
              ? `You're on deck. Head to ${ringLabel} now.`
              : "You're on deck. Head over now."}
          </div>
        </div>
      )}

      {/* Estimated Time */}
      {!isUserOnDeck && ringStatus.userPosition && ringStatus.userPosition > 0 && estimatedTime && (
        <div className="bg-gray-50 dark:bg-warm-950 rounded-lg p-6 text-center">
          <div className="text-gray-600 dark:text-gray-400 mb-2">Your position in line</div>
          <div className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            {ringStatus.userPosition || 'TBD'}
            <span className="text-lg font-normal text-gray-600 dark:text-gray-400">
              {ringStatus.userPosition === 1
                ? 'st'
                : ringStatus.userPosition === 2
                  ? 'nd'
                  : ringStatus.userPosition === 3
                    ? 'rd'
                    : 'th'}
            </span>
          </div>
          <div className="text-gray-600 dark:text-gray-400">
            Estimated wait: {estimatedTime.formatted}
          </div>
          <div className="mt-4 text-sm text-gray-500 dark:text-gray-500">
            <Clock className="w-4 h-4 inline mr-1" />
            We'll send you alerts as you get closer
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="mt-6 space-y-3">
        <button
          onClick={() => startTransition(() => navigate('/exhibitor'))}
          className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
        >
          Back to Dashboard
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

export default RingMonitor;
