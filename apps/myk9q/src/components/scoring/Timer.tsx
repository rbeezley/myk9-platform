import React, { useEffect, useRef } from 'react';
import { useTimerStore } from '../../stores/timerStore';
import './shared-scoring.css';

interface TimerProps {
  areaId?: string;
  name?: string; // For compatibility 
  areaName?: string;
  maxTime?: number; // in milliseconds
  showControls?: boolean;
  size?: 'small' | 'medium' | 'large';
  className?: string;
  compact?: boolean;
  onTimeUpdate?: (formattedTime: string) => void;
}

export const Timer: React.FC<TimerProps> = ({
  areaId,
  name,
  areaName,
  maxTime,
  showControls = true,
  size = 'medium',
  className = '',
  compact: _compact = false,
  onTimeUpdate
}) => {
  // Use name prop as fallback for areaName
  const displayName = areaName || name || 'Timer';
  const timerId = areaId || displayName;
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  
  const {
    getAreaById,
    startTimer,
    stopTimer,
    pauseTimer,
    resumeTimer,
    resetTimer,
    getFormattedTime,
    hasExceededMaxTime,
    soundEnabled,
    markAlertPlayed,
    alertPlayed
  } = useTimerStore();
  
  const area = getAreaById(timerId);
  
  // Update elapsed time every 100ms (10x per second - smooth display, better battery)
  useEffect(() => {
    if (area?.isRunning) {
      intervalRef.current = setInterval(() => {
        const now = Date.now();
        if (area.startTime) {
          const elapsed = now - area.startTime + (area.elapsedTime || 0);
          useTimerStore.setState(state => ({
            areas: state.areas.map(a =>
              a.id === timerId ? { ...a, elapsedTime: elapsed } : a
            )
          }));
        }
      }, 100);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [area?.isRunning, area?.elapsedTime, area?.startTime, timerId]);

  const playTimeExpiredAlert = () => {
    // Create audio context and play beep sound
    if (typeof window !== 'undefined' && window.AudioContext) {
      const audioContext = new AudioContext();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
      oscillator.type = 'square';

      gainNode.gain.setValueAtTime(0, audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);
    }
  };

  // Audio alert when max time exceeded
  useEffect(() => {
    if (area && maxTime && hasExceededMaxTime(timerId) && !alertPlayed.has(timerId)) {
      if (soundEnabled) {
        playTimeExpiredAlert();
      }
      markAlertPlayed(timerId);
    }
  }, [area, maxTime, timerId, soundEnabled, hasExceededMaxTime, markAlertPlayed, alertPlayed]);

  // Call onTimeUpdate when timer stops
  useEffect(() => {
    if (onTimeUpdate && area && !area.isRunning && !area.isPaused && area.elapsedTime > 0) {
      const formattedTime = getFormattedTime(area.elapsedTime);
      onTimeUpdate(formattedTime);
    }
  }, [area, onTimeUpdate, getFormattedTime]);
  
  const handleStart = () => {
    if (area?.isPaused) {
      resumeTimer(timerId);
    } else {
      startTimer(timerId);
    }
  };
  
  const getProgressPercentage = () => {
    if (!maxTime || !area) return 0;
    return Math.min((area.elapsedTime / maxTime) * 100, 100);
  };
  
  const getTimerStatus = () => {
    if (!area) return 'stopped';
    if (area.isRunning) return 'running';
    if (area.isPaused) return 'paused';
    if (area.elapsedTime > 0) return 'stopped';
    return 'ready';
  };
  
  const getStatusColor = () => {
    if (!area) return 'gray';
    if (maxTime && hasExceededMaxTime(timerId)) return 'red';
    if (area.isRunning) return 'green';
    if (area.isPaused) return 'orange';
    return 'blue';
  };
  
  if (!area) {
    return (
      <div className={`timer ${size} error ${className}`}>
        <div className="timer-display">Error: Timer area not found</div>
      </div>
    );
  }
  
  return (
    <div className={`timer ${size} ${getTimerStatus()} ${className}`}>
      <div className="timer-header">
        <h3 className="timer-name">{areaName}</h3>
        {maxTime && (
          <span className="timer-max-time">
            Max: {getFormattedTime(maxTime)}
          </span>
        )}
      </div>
      
      <div className={`timer-display ${getStatusColor()}`}>
        <div className="timer-time">
          {getFormattedTime(area.elapsedTime)}
        </div>
        
        {maxTime && (
          <div className="timer-progress-container">
            <div 
              className="timer-progress-bar"
              style={{ width: `${getProgressPercentage()}%` }}
            />
            <div className="timer-progress-text">
              {Math.round((area.elapsedTime / maxTime) * 100)}%
            </div>
          </div>
        )}
        
        {hasExceededMaxTime(timerId) && (
          <div className="timer-warning">
            ⚠️ TIME EXCEEDED
          </div>
        )}
      </div>
      
      {showControls && (
        <div className="timer-controls">
          {!area.isRunning && !area.isPaused && (
            <button 
              className="timer-button start"
              onClick={handleStart}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                <path d="M8 5v14l11-7z"/>
              </svg>
              Start
            </button>
          )}
          
          {area.isRunning && (
            <button 
              className="timer-button pause"
              onClick={() => pauseTimer(timerId)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
              </svg>
              Pause
            </button>
          )}
          
          {area.isPaused && (
            <button 
              className="timer-button resume"
              onClick={() => resumeTimer(timerId)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                <path d="M8 5v14l11-7z"/>
              </svg>
              Resume
            </button>
          )}
          
          {(area.isRunning || area.isPaused) && (
            <button 
              className="timer-button stop"
              onClick={() => stopTimer(timerId)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                <path d="M6 6h12v12H6z"/>
              </svg>
              Stop
            </button>
          )}
          
          {area.elapsedTime > 0 && !area.isRunning && (
            <button 
              className="timer-button reset"
              onClick={() => resetTimer(timerId)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
              </svg>
              Reset
            </button>
          )}
        </div>
      )}
      
      <div className="timer-status-indicator">
        <div className={`status-dot ${getStatusColor()}`} />
        <span className="status-text">
          {getTimerStatus().charAt(0).toUpperCase() + getTimerStatus().slice(1)}
        </span>
      </div>
    </div>
  );
};