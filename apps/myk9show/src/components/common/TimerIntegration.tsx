/**
 * Timer Integration Component
 * 
 * Demonstrates and tests the complete timer system integration
 * with audio warnings and time limits. This component serves as
 * both a development tool and integration test.
 */

import React, { useState } from 'react';
import { DualTimerDisplay } from './DualTimerDisplay';
import { AudioSettingsProvider } from '@/context/AudioSettingsContext';
import { useAudioSettings } from '@/hooks/useAudioSettings';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { msToDisplay } from '@/lib/timeUtils';
import { Volume2, VolumeX, TestTube, RotateCcw } from 'lucide-react';
import { logger } from '@/services/LoggingService';

// Scent Work time limits by element and level
const SCENT_WORK_TIME_LIMITS = {
  'Container': {
    'Novice': 120000,     // 2:00
    'Advanced': 150000,   // 2:30  
    'Excellent': 180000,  // 3:00
    'Masters': 180000     // 3:00
  },
  'Interior': {
    'Novice': 180000,     // 3:00
    'Advanced': 210000,   // 3:30
    'Excellent': 240000,  // 4:00 per area (2 areas total)
    'Masters': {          // 3 areas with different limits
      area1: 60000,       // 1:00
      area2: 150000,      // 2:30
      area3: 300000       // 5:00
    }
  },
  'Exterior': {
    'Novice': 180000,     // 3:00
    'Advanced': 210000,   // 3:30
    'Excellent': 240000,  // 4:00
    'Masters': 240000     // 4:00
  },
  'Buried': {
    'Novice': 180000,     // 3:00
    'Advanced': 210000,   // 3:30
    'Excellent': 240000,  // 4:00
    'Masters': 240000     // 4:00
  }
} as const;

type Element = keyof typeof SCENT_WORK_TIME_LIMITS;
type Level = 'Novice' | 'Advanced' | 'Excellent' | 'Masters';

/**
 * Timer Integration Test Component
 * 
 * Provides a comprehensive testing interface for the timer system
 * with different class configurations and audio settings.
 */
export function TimerIntegration() {
  return (
    <AudioSettingsProvider>
      <TimerIntegrationContent />
    </AudioSettingsProvider>
  );
}

function TimerIntegrationContent() {
  const [selectedElement, setSelectedElement] = useState<Element>('Container');
  const [selectedLevel, setSelectedLevel] = useState<Level>('Novice');
  const [resultTime, setResultTime] = useState<number | null>(null);
  const [warningCount, setWarningCount] = useState(0);
  const [expiredCount, setExpiredCount] = useState(0);

  const { settings, updateSettings } = useAudioSettings();

  // Get time limit for selected element/level
  const getTimeLimit = (element: Element, level: Level): number => {
    const elementLimits = SCENT_WORK_TIME_LIMITS[element];
    if (element === 'Interior' && level === 'Masters') {
      // For demo purposes, use Area 1 time limit
      const mastersLimits = elementLimits[level] as { area1: number; area2: number; area3: number };
      return mastersLimits.area1;
    }
    return elementLimits[level] as number;
  };

  const maxTimeMs = getTimeLimit(selectedElement, selectedLevel);

  // Reset counters when class changes
  React.useEffect(() => {
    setWarningCount(0);
    setExpiredCount(0);
    setResultTime(null);
  }, [selectedElement, selectedLevel]);

  const handleTimeWarning = () => {
    setWarningCount(prev => prev + 1);
    logger.debug('Time warning triggered', 'components', {});
  };

  const handleTimeExpired = () => {
    setExpiredCount(prev => prev + 1);
    logger.debug('Time expired', 'components', {});
  };

  const handleSearchTime = (timeMs: number) => {
    setResultTime(timeMs);
    logger.debug('Search time recorded:', 'common', { data: msToDisplay(timeMs, 'hundredths') });
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Timer System Integration Test
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Test the complete timer system with different class configurations
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Class Configuration */}
        <Card>
          <CardHeader>
            <CardTitle>Class Configuration</CardTitle>
            <CardDescription>
              Select element and level to test different time limits
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="element">Element</Label>
              <Select value={selectedElement} onValueChange={(value: Element) => setSelectedElement(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Container">Container</SelectItem>
                  <SelectItem value="Interior">Interior</SelectItem>
                  <SelectItem value="Exterior">Exterior</SelectItem>
                  <SelectItem value="Buried">Buried</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="level">Level</Label>
              <Select value={selectedLevel} onValueChange={(value: Level) => setSelectedLevel(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Novice">Novice</SelectItem>
                  <SelectItem value="Advanced">Advanced</SelectItem>
                  <SelectItem value="Excellent">Excellent</SelectItem>
                  <SelectItem value="Masters">Masters</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="pt-4 border-t space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Time Limit:</span>
                <Badge variant="secondary">
                  {msToDisplay(maxTimeMs, 'seconds')}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Warning at:</span>
                <Badge variant={selectedLevel === 'Masters' ? 'outline' : 'default'}>
                  {selectedLevel === 'Masters' ? 'No Warnings' : '30 seconds'}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Audio Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Audio Settings</CardTitle>
            <CardDescription>
              Configure timer audio feedback
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="warning-sound">Warning Sound</Label>
                <Switch
                  id="warning-sound"
                  checked={settings.warningSound}
                  onCheckedChange={(checked) => 
                    updateSettings({ warningSound: checked })
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="expired-sound">Time Expired Sound</Label>
                <Switch
                  id="expired-sound"
                  checked={settings.timeExpiredSound}
                  onCheckedChange={(checked) => 
                    updateSettings({ timeExpiredSound: checked })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="sound-type">Sound Type</Label>
                <Select 
                  value={settings.soundType} 
                  onValueChange={(value: 'beep' | 'chime' | 'tone') => 
                    updateSettings({ soundType: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="beep">Beep</SelectItem>
                    <SelectItem value="chime">Chime</SelectItem>
                    <SelectItem value="tone">Tone</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  {settings.volume === 0 ? (
                    <VolumeX className="h-4 w-4" />
                  ) : (
                    <Volume2 className="h-4 w-4" />
                  )}
                  <Label htmlFor="volume">Volume: {Math.round(settings.volume * 100)}%</Label>
                </div>
                <Slider
                  id="volume"
                  min={0}
                  max={1}
                  step={0.1}
                  value={[settings.volume]}
                  onValueChange={([newValue]: number[]) => updateSettings({ volume: newValue })}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Timer Display */}
      <Card>
        <CardHeader>
          <CardTitle>Timer Display</CardTitle>
          <CardDescription>
            {selectedElement} {selectedLevel} - {msToDisplay(maxTimeMs, 'seconds')} time limit
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DualTimerDisplay
            maxTimeMs={maxTimeMs}
            level={selectedLevel}
            onTimeWarning={handleTimeWarning}
            onTimeExpired={handleTimeExpired}
            onSearchTime={handleSearchTime}
            size="large"
            className="mx-auto"
          />
        </CardContent>
      </Card>

      {/* Results and Statistics */}
      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-center">Recorded Time</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center">
              {resultTime !== null ? (
                <div className="space-y-1">
                  <div className="text-2xl font-mono font-bold text-green-600">
                    {msToDisplay(resultTime, 'hundredths')}
                  </div>
                  <div className="text-sm text-gray-600">
                    Search completed
                  </div>
                </div>
              ) : (
                <div className="text-gray-400">
                  <TestTube className="h-8 w-8 mx-auto mb-2" />
                  <div className="text-sm">No time recorded</div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-center">Warnings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-600">
                {warningCount}
              </div>
              <div className="text-sm text-gray-600">
                30-second alerts
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-center">Time Expired</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">
                {expiredCount}
              </div>
              <div className="text-sm text-gray-600">
                Limit exceeded
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Reset Button */}
      <div className="flex justify-center">
        <Button
          variant="outline"
          onClick={() => {
            setWarningCount(0);
            setExpiredCount(0);
            setResultTime(null);
          }}
          className="space-x-2"
        >
          <RotateCcw className="h-4 w-4" />
          <span>Reset Statistics</span>
        </Button>
      </div>
    </div>
  );
}