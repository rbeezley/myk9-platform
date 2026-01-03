import React, { useEffect } from 'react';
import { Timer } from './Timer';
import { useTimerStore } from '../../stores/timerStore';
import './shared-scoring.css';

interface TimerAreaConfig {
  name: string;
  maxTime?: number;
}

interface MultiTimerProps {
  areas: TimerAreaConfig[];
  layout?: 'horizontal' | 'vertical' | 'grid';
  showGlobalControls?: boolean;
  className?: string;
  onTimerUpdate?: (areaName: string, formattedTime: string) => void;
}

export const MultiTimer: React.FC<MultiTimerProps> = ({
  areas,
  layout = 'grid',
  showGlobalControls = true,
  className = '',
  onTimerUpdate
}) => {
  const {
    areas: timerAreas,
    createArea,
    clearAllAreas,
    startAllTimers,
    stopAllTimers,
    pauseAllTimers,
    getTotalTime,
    getFormattedTime,
    isAnyTimerRunning,
    setSoundEnabled,
    soundEnabled
  } = useTimerStore();
  
  // Initialize timer areas
  useEffect(() => {
    // Clear existing areas and create new ones
    clearAllAreas();
    
    areas.forEach(areaConfig => {
      createArea(areaConfig.name, areaConfig.maxTime);
    });
    
    // Cleanup on unmount
    return () => {
      clearAllAreas();
    };
  }, [areas, createArea, clearAllAreas]);

  // Watch for timer changes and call callback when timers are stopped
  useEffect(() => {
    if (!onTimerUpdate) return;

    timerAreas.forEach(area => {
      // If timer is stopped and has elapsed time, notify parent
      if (!area.isRunning && !area.isPaused && area.elapsedTime > 0) {
        const formattedTime = getFormattedTime(area.elapsedTime);
        onTimerUpdate(area.name, formattedTime);
      }
    });
  }, [timerAreas, onTimerUpdate, getFormattedTime]);
  
  const handleStartAll = () => {
    startAllTimers();
  };
  
  const handleStopAll = () => {
    stopAllTimers();
  };
  
  const handlePauseAll = () => {
    pauseAllTimers();
  };
  
  const getRunningCount = () => {
    return timerAreas.filter(area => area.isRunning).length;
  };
  
  const getPausedCount = () => {
    return timerAreas.filter(area => area.isPaused).length;
  };
  
  const getCompletedCount = () => {
    return timerAreas.filter(area => area.endTime !== null).length;
  };
  
  if (timerAreas.length === 0) {
    return (
      <div className={`multi-timer loading ${className}`}>
        <div className="loading-message">Initializing timers...</div>
      </div>
    );
  }
  
  return (
    <div className={`multi-timer ${layout} ${className}`}>
      {showGlobalControls && (
        <div className="multi-timer-header">
          <div className="timer-summary">
            <h2>Multi-Area Timer</h2>
            <div className="timer-stats">
              <div className="stat-item">
                <span className="stat-label">Total Time:</span>
                <span className="stat-value">{getFormattedTime(getTotalTime())}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Active:</span>
                <span className="stat-value">{getRunningCount()}/{timerAreas.length}</span>
              </div>
              {getPausedCount() > 0 && (
                <div className="stat-item">
                  <span className="stat-label">Paused:</span>
                  <span className="stat-value">{getPausedCount()}</span>
                </div>
              )}
              {getCompletedCount() > 0 && (
                <div className="stat-item">
                  <span className="stat-label">Completed:</span>
                  <span className="stat-value">{getCompletedCount()}</span>
                </div>
              )}
            </div>
          </div>
          
          <div className="global-controls">
            <button
              className="global-button start-all"
              onClick={handleStartAll}
              disabled={isAnyTimerRunning}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                <path d="M8 5v14l11-7z"/>
              </svg>
              Start All
            </button>
            
            <button
              className="global-button pause-all"
              onClick={handlePauseAll}
              disabled={!isAnyTimerRunning}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
              </svg>
              Pause All
            </button>
            
            <button
              className="global-button stop-all"
              onClick={handleStopAll}
              disabled={getRunningCount() === 0 && getPausedCount() === 0}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                <path d="M6 6h12v12H6z"/>
              </svg>
              Stop All
            </button>
            
            <button
              className={`global-button sound-toggle ${soundEnabled ? 'active' : ''}`}
              onClick={() => setSoundEnabled(!soundEnabled)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                {soundEnabled ? (
                  <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                ) : (
                  <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
                )}
              </svg>
              {soundEnabled ? 'Sound On' : 'Sound Off'}
            </button>
          </div>
        </div>
      )}
      
      <div className={`timer-grid ${layout}`}>
        {timerAreas.map((area) => (
          <Timer
            key={area.id}
            areaId={area.id}
            areaName={area.name}
            maxTime={area.maxTime}
            showControls={true}
            size="medium"
            className="multi-timer-item"
          />
        ))}
      </div>
    </div>
  );
};