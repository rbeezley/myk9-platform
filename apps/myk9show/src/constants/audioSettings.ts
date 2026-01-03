export interface AudioSettings {
  warningSound: boolean;      // 30-second warning beep
  timeExpiredSound: boolean;  // Time limit exceeded alert
  startSound: boolean;        // Timer start confirmation
  stopSound: boolean;         // Timer stop confirmation
  volume: number;             // 0.0 to 1.0
  soundType: 'beep' | 'chime' | 'tone';
}

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  warningSound: true,
  timeExpiredSound: true,
  startSound: false,
  stopSound: false,
  volume: 0.7,
  soundType: 'beep'
};