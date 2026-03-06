/**
 * Theme Selector Component
 * Phase 6.4: User Preferences & UI State
 *
 * Theme switching and accessibility options
 */

import React from 'react';
import {
  Monitor,
  Sun,
  Moon,
  Palette,
  Type,
  Layout,
  Eye,
  Accessibility,
  RotateCcw,
  Check,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useSettingsStore } from '@/stores/settingsStore';
import type {
  ThemePreferences,
  ThemeMode,
  ColorScheme,
  LayoutDensity,
  FontSizeScale,
} from '@/types/user-preferences';

interface ThemeSelectorProps {
  preferences?: ThemePreferences | undefined;
  onUpdate: (preferences: Partial<ThemePreferences>) => void;
  onReset: () => void;
}

const themeOptions: Array<{
  value: ThemeMode;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}> = [
  { value: 'light', label: 'Light', icon: Sun, description: 'Use light theme always' },
  { value: 'dark', label: 'Dark', icon: Moon, description: 'Use dark theme always' },
  { value: 'system', label: 'System', icon: Monitor, description: 'Follow system preference' },
];

// Color schemes matching settingsStore accent colors
const colorSchemes: Array<{
  value: ColorScheme;
  label: string;
  color: string;
  description: string;
  accentId: 'green' | 'blue' | 'orange' | 'purple';
}> = [
  {
    value: 'green',
    label: 'Teal',
    color: '#14b8a6',
    description: 'Brand primary color',
    accentId: 'green',
  },
  {
    value: 'blue',
    label: 'Ocean',
    color: '#3b82f6',
    description: 'Classic professional',
    accentId: 'blue',
  },
  {
    value: 'orange',
    label: 'Sunset',
    color: '#f97316',
    description: 'Energetic warm',
    accentId: 'orange',
  },
  {
    value: 'purple',
    label: 'Royal',
    color: '#8b5cf6',
    description: 'Elegant purple',
    accentId: 'purple',
  },
];

const densityOptions: Array<{ value: LayoutDensity; label: string; description: string }> = [
  { value: 'compact', label: 'Compact', description: 'Dense layout, more content' },
  { value: 'comfortable', label: 'Comfortable', description: 'Balanced spacing' },
  { value: 'spacious', label: 'Spacious', description: 'Generous spacing, easier reading' },
];

const fontSizeOptions: Array<{
  value: FontSizeScale;
  label: string;
  description: string;
  scale: string;
}> = [
  { value: 'small', label: 'Small', description: 'Compact text size', scale: '0.9x' },
  { value: 'medium', label: 'Medium', description: 'Standard text size', scale: '1.0x' },
  { value: 'large', label: 'Large', description: 'Larger text size', scale: '1.2x' },
  { value: 'extra-large', label: 'Extra Large', description: 'Maximum text size', scale: '1.4x' },
];

export function ThemeSelector({ preferences, onUpdate, onReset }: ThemeSelectorProps) {
  const { settings, updateSettings } = useSettingsStore();

  /**
   * Handle theme mode change
   */
  const handleModeChange = (mode: ThemeMode) => {
    onUpdate({ mode });
  };

  /**
   * Handle color scheme change
   * Updates both the preferences system and the settingsStore for immediate CSS application
   */
  const handleColorSchemeChange = (colorScheme: ColorScheme) => {
    onUpdate({ colorScheme });

    // Find the matching accent color for the settingsStore
    const scheme = colorSchemes.find(s => s.value === colorScheme);
    if (scheme) {
      // Update settingsStore which applies the accent-{color} CSS class
      updateSettings({ accentColor: scheme.accentId });
    }
  };

  /**
   * Handle layout density change
   */
  const handleDensityChange = (layoutDensity: LayoutDensity) => {
    onUpdate({ layoutDensity });

    // Apply density class to body
    document.body.className = document.body.className
      .replace(/\bdensity-\w+\b/g, '')
      .concat(` density-${layoutDensity}`);
  };

  /**
   * Handle font size change
   */
  const handleFontSizeChange = (fontSize: FontSizeScale) => {
    onUpdate({ fontSize });

    // Apply font size scale
    const root = document.documentElement;
    const scales = {
      small: '0.9',
      medium: '1.0',
      large: '1.2',
      'extra-large': '1.4',
    };
    root.style.setProperty('--font-scale', scales[fontSize]);
  };

  /**
   * Handle accessibility toggles
   */
  const handleAccessibilityChange = (
    setting: 'reduceMotion' | 'highContrast',
    enabled: boolean
  ) => {
    onUpdate({ [setting]: enabled });

    // Apply accessibility settings
    const root = document.documentElement;
    if (setting === 'reduceMotion') {
      root.classList.toggle('reduce-motion', enabled);
    } else if (setting === 'highContrast') {
      root.classList.toggle('high-contrast', enabled);
    }
  };

  return (
    <div className="space-y-6">
      {/* Theme Mode */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Monitor className="h-5 w-5" />
            Theme Mode
          </CardTitle>
          <CardDescription>Choose between light, dark, or system theme</CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={preferences?.mode || 'system'}
            onValueChange={handleModeChange}
            className="grid grid-cols-3 gap-4"
          >
            {themeOptions.map(option => (
              <div key={option.value}>
                <RadioGroupItem value={option.value} id={option.value} className="peer sr-only" />
                <Label
                  htmlFor={option.value}
                  className="flex flex-col items-center justify-between rounded-lg border-2 border-muted p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
                >
                  <option.icon className="h-6 w-6 mb-2" />
                  <div className="text-center">
                    <div className="font-medium">{option.label}</div>
                    <div className="text-xs text-muted-foreground mt-1">{option.description}</div>
                  </div>
                  {preferences?.mode === option.value && (
                    <Check className="h-4 w-4 text-primary mt-2" />
                  )}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Color Scheme */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Color Scheme
          </CardTitle>
          <CardDescription>Select an accent color for the interface</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {colorSchemes.map(scheme => {
              // Use settingsStore accent color as source of truth
              const isSelected = settings.accentColor === scheme.accentId;
              return (
                <Button
                  key={scheme.value}
                  variant={isSelected ? 'default' : 'outline'}
                  className="h-auto p-4 flex flex-col items-center gap-2 transition-all duration-200"
                  onClick={() => handleColorSchemeChange(scheme.value)}
                  style={
                    isSelected ? { backgroundColor: scheme.color, borderColor: scheme.color } : {}
                  }
                >
                  <div
                    className="w-8 h-8 rounded-full shadow-md transition-transform duration-200 hover:scale-110"
                    style={{
                      backgroundColor: scheme.color,
                      boxShadow: isSelected
                        ? `0 0 0 3px white, 0 0 0 5px ${scheme.color}`
                        : undefined,
                    }}
                  />
                  <div className="text-center">
                    <div className="font-medium text-sm">{scheme.label}</div>
                    <div
                      className={`text-xs ${isSelected ? 'text-white/80' : 'text-muted-foreground'}`}
                    >
                      {scheme.description}
                    </div>
                  </div>
                  {isSelected && <Check className="h-4 w-4" />}
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Layout Density */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layout className="h-5 w-5" />
            Layout Density
          </CardTitle>
          <CardDescription>Adjust the spacing and density of interface elements</CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={preferences?.layoutDensity || 'comfortable'}
            onValueChange={handleDensityChange}
            className="space-y-3"
          >
            {densityOptions.map(option => (
              <div key={option.value} className="flex items-center space-x-3">
                <RadioGroupItem value={option.value} id={`density-${option.value}`} />
                <Label htmlFor={`density-${option.value}`} className="flex-1">
                  <div className="font-medium">{option.label}</div>
                  <div className="text-sm text-muted-foreground">{option.description}</div>
                </Label>
                {preferences?.layoutDensity === option.value && (
                  <Badge variant="secondary" className="text-xs">
                    Current
                  </Badge>
                )}
              </div>
            ))}
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Font Size */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Type className="h-5 w-5" />
            Font Size
          </CardTitle>
          <CardDescription>Adjust the text size for better readability</CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={preferences?.fontSize || 'medium'}
            onValueChange={handleFontSizeChange}
            className="space-y-3"
          >
            {fontSizeOptions.map(option => (
              <div key={option.value} className="flex items-center space-x-3">
                <RadioGroupItem value={option.value} id={`font-${option.value}`} />
                <Label htmlFor={`font-${option.value}`} className="flex-1">
                  <div className="font-medium">{option.label}</div>
                  <div className="text-sm text-muted-foreground">{option.description}</div>
                </Label>
                <Badge variant="outline" className="text-xs">
                  {option.scale}
                </Badge>
                {preferences?.fontSize === option.value && (
                  <Badge variant="secondary" className="text-xs">
                    Current
                  </Badge>
                )}
              </div>
            ))}
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Accessibility */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Accessibility className="h-5 w-5" />
            Accessibility
          </CardTitle>
          <CardDescription>
            Options to improve accessibility and reduce visual distractions
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="font-medium">Reduce Motion</Label>
              <div className="text-sm text-muted-foreground">
                Minimize animations and transitions
              </div>
            </div>
            <Switch
              checked={preferences?.reduceMotion || false}
              onCheckedChange={checked => handleAccessibilityChange('reduceMotion', checked)}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="font-medium">High Contrast</Label>
              <div className="text-sm text-muted-foreground">
                Increase contrast for better visibility
              </div>
            </div>
            <Switch
              checked={preferences?.highContrast || false}
              onCheckedChange={checked => handleAccessibilityChange('highContrast', checked)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Preview Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Preview
          </CardTitle>
          <CardDescription>Preview how your theme settings will look</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg p-4 bg-background">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold">Sample Content</h4>
                <Badge>New</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                This is how text will appear with your current settings. The layout density and font
                size will affect the spacing and readability.
              </p>
              <div className="flex gap-2">
                <Button size="sm">Primary Button</Button>
                <Button variant="outline" size="sm">
                  Secondary
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Reset Button */}
      <div className="flex justify-end">
        <Button variant="outline" onClick={onReset} className="flex items-center gap-2">
          <RotateCcw className="h-4 w-4" />
          Reset Theme Settings
        </Button>
      </div>
    </div>
  );
}
