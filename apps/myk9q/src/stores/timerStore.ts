import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

export interface TimerArea {
  id: string;
  name: string;
  startTime: number | null;
  endTime: number | null;
  elapsedTime: number;
  isRunning: boolean;
  isPaused: boolean;
  maxTime?: number; // Maximum time in milliseconds
}

interface TimerState {
  // Timer Areas (for multi-area scent work)
  areas: TimerArea[];
  activeAreaId: string | null;
  
  // Global Timer State
  globalStartTime: number | null;
  globalElapsedTime: number;
  isAnyTimerRunning: boolean;
  
  // Audio Settings
  soundEnabled: boolean;
  volumeLevel: number;
  alertPlayed: Set<string>; // Track which areas have played alerts
  
  // Actions
  createArea: (name: string, maxTime?: number) => TimerArea;
  removeArea: (areaId: string) => void;
  clearAllAreas: () => void;
  
  // Timer Controls
  startTimer: (areaId: string) => void;
  stopTimer: (areaId: string) => void;
  pauseTimer: (areaId: string) => void;
  resumeTimer: (areaId: string) => void;
  resetTimer: (areaId: string) => void;
  
  // Multi-area Controls
  startAllTimers: () => void;
  stopAllTimers: () => void;
  pauseAllTimers: () => void;
  
  // Time Management
  setAreaTime: (areaId: string, time: number) => void;
  updateElapsedTime: (areaId: string) => void;
  getTotalTime: () => number;
  
  // Audio Controls
  setSoundEnabled: (enabled: boolean) => void;
  setVolumeLevel: (level: number) => void;
  markAlertPlayed: (areaId: string) => void;
  
  // Utilities
  getAreaById: (areaId: string) => TimerArea | undefined;
  getFormattedTime: (milliseconds: number) => string;
  hasExceededMaxTime: (areaId: string) => boolean;
}

export const useTimerStore = create<TimerState>()(
  devtools(
    (set, get) => ({
      areas: [],
      activeAreaId: null,
      globalStartTime: null,
      globalElapsedTime: 0,
      isAnyTimerRunning: false,
      soundEnabled: true,
      volumeLevel: 0.7,
      alertPlayed: new Set(),

      createArea: (name, maxTime) => {
        const newArea: TimerArea = {
          id: crypto.randomUUID(),
          name,
          startTime: null,
          endTime: null,
          elapsedTime: 0,
          isRunning: false,
          isPaused: false,
          maxTime
        };

        set((state) => ({
          areas: [...state.areas, newArea]
        }));

        return newArea;
      },

      removeArea: (areaId) => {
        set((state) => ({
          areas: state.areas.filter(area => area.id !== areaId),
          activeAreaId: state.activeAreaId === areaId ? null : state.activeAreaId
        }));
      },

      clearAllAreas: () => {
        set({
          areas: [],
          activeAreaId: null,
          globalStartTime: null,
          globalElapsedTime: 0,
          isAnyTimerRunning: false,
          alertPlayed: new Set()
        });
      },

      startTimer: (areaId) => {
        const now = Date.now();
        
        set((state) => {
          const updatedAreas = state.areas.map(area => {
            if (area.id === areaId && !area.isRunning) {
              return {
                ...area,
                startTime: now,
                endTime: null,
                isRunning: true,
                isPaused: false
              };
            }
            return area;
          });

          const isAnyRunning = updatedAreas.some(area => area.isRunning);

          return {
            areas: updatedAreas,
            activeAreaId: areaId,
            globalStartTime: state.globalStartTime || now,
            isAnyTimerRunning: isAnyRunning
          };
        });
      },

      stopTimer: (areaId) => {
        const now = Date.now();
        
        set((state) => {
          const updatedAreas = state.areas.map(area => {
            if (area.id === areaId && area.isRunning) {
              const elapsed = area.startTime ? now - area.startTime + area.elapsedTime : area.elapsedTime;
              return {
                ...area,
                endTime: now,
                elapsedTime: elapsed,
                isRunning: false,
                isPaused: false
              };
            }
            return area;
          });

          const isAnyRunning = updatedAreas.some(area => area.isRunning);

          return {
            areas: updatedAreas,
            isAnyTimerRunning: isAnyRunning,
            globalElapsedTime: isAnyRunning ? state.globalElapsedTime : now - (state.globalStartTime || now)
          };
        });
      },

      pauseTimer: (areaId) => {
        const now = Date.now();
        
        set((state) => ({
          areas: state.areas.map(area => {
            if (area.id === areaId && area.isRunning && !area.isPaused) {
              const elapsed = area.startTime ? now - area.startTime + area.elapsedTime : area.elapsedTime;
              return {
                ...area,
                elapsedTime: elapsed,
                isRunning: false,
                isPaused: true
              };
            }
            return area;
          })
        }));
      },

      resumeTimer: (areaId) => {
        const now = Date.now();
        
        set((state) => ({
          areas: state.areas.map(area => {
            if (area.id === areaId && area.isPaused) {
              return {
                ...area,
                startTime: now,
                isRunning: true,
                isPaused: false
              };
            }
            return area;
          }),
          isAnyTimerRunning: true
        }));
      },

      resetTimer: (areaId) => {
        set((state) => ({
          areas: state.areas.map(area => {
            if (area.id === areaId) {
              return {
                ...area,
                startTime: null,
                endTime: null,
                elapsedTime: 0,
                isRunning: false,
                isPaused: false
              };
            }
            return area;
          }),
          alertPlayed: new Set([...state.alertPlayed].filter(id => id !== areaId))
        }));
      },

      startAllTimers: () => {
        const now = Date.now();
        
        set((state) => ({
          areas: state.areas.map(area => ({
            ...area,
            startTime: now,
            endTime: null,
            isRunning: true,
            isPaused: false
          })),
          globalStartTime: now,
          isAnyTimerRunning: true
        }));
      },

      stopAllTimers: () => {
        const now = Date.now();
        
        set((state) => ({
          areas: state.areas.map(area => {
            if (area.isRunning) {
              const elapsed = area.startTime ? now - area.startTime + area.elapsedTime : area.elapsedTime;
              return {
                ...area,
                endTime: now,
                elapsedTime: elapsed,
                isRunning: false,
                isPaused: false
              };
            }
            return area;
          }),
          globalElapsedTime: now - (state.globalStartTime || now),
          isAnyTimerRunning: false
        }));
      },

      pauseAllTimers: () => {
        const now = Date.now();
        
        set((state) => ({
          areas: state.areas.map(area => {
            if (area.isRunning) {
              const elapsed = area.startTime ? now - area.startTime + area.elapsedTime : area.elapsedTime;
              return {
                ...area,
                elapsedTime: elapsed,
                isRunning: false,
                isPaused: true
              };
            }
            return area;
          }),
          isAnyTimerRunning: false
        }));
      },

      setAreaTime: (areaId, time) => {
        set((state) => ({
          areas: state.areas.map(area =>
            area.id === areaId ? { ...area, elapsedTime: time } : area
          )
        }));
      },

      updateElapsedTime: (areaId) => {
        const now = Date.now();
        
        set((state) => ({
          areas: state.areas.map(area => {
            if (area.id === areaId && area.isRunning && area.startTime) {
              return {
                ...area,
                elapsedTime: now - area.startTime + (area.elapsedTime || 0)
              };
            }
            return area;
          })
        }));
      },

      getTotalTime: () => {
        const areas = get().areas;
        return areas.reduce((total, area) => total + area.elapsedTime, 0);
      },

      setSoundEnabled: (enabled) => {
        set({ soundEnabled: enabled });
      },

      setVolumeLevel: (level) => {
        set({ volumeLevel: Math.max(0, Math.min(1, level)) });
      },

      markAlertPlayed: (areaId) => {
        set((state) => ({
          alertPlayed: new Set([...state.alertPlayed, areaId])
        }));
      },

      getAreaById: (areaId) => {
        return get().areas.find(area => area.id === areaId);
      },

      getFormattedTime: (milliseconds) => {
        const totalSeconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        const ms = milliseconds % 1000;
        
        return `${minutes.toString().padStart(2, '0')}:${seconds
          .toString()
          .padStart(2, '0')}.${Math.floor(ms / 10)
          .toString()
          .padStart(2, '0')}`;
      },

      hasExceededMaxTime: (areaId) => {
        const area = get().getAreaById(areaId);
        if (!area || !area.maxTime) return false;
        return area.elapsedTime >= area.maxTime;
      }
    }),
    { enabled: import.meta.env.DEV }
  )
);