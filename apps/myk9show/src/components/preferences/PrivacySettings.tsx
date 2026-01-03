/**
 * Privacy Settings Component
 * Phase 6.4: User Preferences & UI State
 * 
 * Privacy and data sharing preferences
 */

import React from 'react';
import { 
  Shield, 
  Eye, 
  Users, 
  BarChart3, 
  Bug, 
  Database,
  AlertTriangle,
  Info,
  CheckCircle,
  RotateCcw
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { PrivacyPreferences } from '@/types/user-preferences';

interface PrivacySettingsProps {
  preferences?: PrivacyPreferences;
  onUpdate: (preferences: Partial<PrivacyPreferences>) => void;
  onReset: () => void;
}

const privacySettings = [
  {
    key: 'sharePresence' as keyof PrivacyPreferences,
    label: 'Share Presence',
    description: 'Allow others to see when you\'re active in competitions',
    icon: Users,
    impact: 'medium' as const,
    category: 'social' as const,
    details: 'Other users in the same competition can see when you\'re currently viewing results or making entries.',
  },
  {
    key: 'showOnlineStatus' as keyof PrivacyPreferences,
    label: 'Online Status',
    description: 'Show when you\'re online to other users',
    icon: Eye,
    impact: 'low' as const,
    category: 'social' as const,
    details: 'Display a green indicator when you\'re actively using the platform.',
  },
  {
    key: 'allowAnalytics' as keyof PrivacyPreferences,
    label: 'Usage Analytics',
    description: 'Help improve the app by sharing anonymous usage data',
    icon: BarChart3,
    impact: 'low' as const,
    category: 'analytics' as const,
    details: 'Anonymous data about feature usage, page views, and performance to help us improve the platform.',
  },
  {
    key: 'dataCollection' as keyof PrivacyPreferences,
    label: 'Data Collection',
    description: 'Allow collection of aggregated usage patterns',
    icon: Database,
    impact: 'medium' as const,
    category: 'analytics' as const,
    details: 'Collect anonymized data about how features are used to identify improvements and optimize performance.',
  },
  {
    key: 'shareUsageStats' as keyof PrivacyPreferences,
    label: 'Usage Statistics',
    description: 'Share anonymous statistics to help improve the platform',
    icon: BarChart3,
    impact: 'low' as const,
    category: 'analytics' as const,
    details: 'Aggregate, anonymous statistics that help us understand platform usage and plan new features.',
  },
  {
    key: 'enableCrashReporting' as keyof PrivacyPreferences,
    label: 'Crash Reporting',
    description: 'Automatically report crashes and errors to help fix bugs',
    icon: Bug,
    impact: 'low' as const,
    category: 'technical' as const,
    details: 'Automatic error reports that include technical details to help us identify and fix issues quickly.',
  },
];

const privacyCategories = {
  social: {
    label: 'Social & Visibility',
    description: 'Control what others can see about your activity',
    icon: Users,
  },
  analytics: {
    label: 'Analytics & Insights',
    description: 'Help improve the platform through data sharing',
    icon: BarChart3,
  },
  technical: {
    label: 'Technical & Support',
    description: 'Automatic error reporting and diagnostics',
    icon: Bug,
  },
};

export function PrivacySettings({ preferences, onUpdate, onReset }: PrivacySettingsProps) {
  
  /**
   * Handle privacy setting toggle
   */
  const handlePrivacyToggle = (setting: keyof PrivacyPreferences, enabled: boolean) => {
    onUpdate({ [setting]: enabled });
  };

  /**
   * Get impact badge color
   */
  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'high': return 'destructive';
      case 'medium': return 'default';
      case 'low': return 'secondary';
      default: return 'outline';
    }
  };

  /**
   * Group settings by category
   */
  const settingsByCategory = privacySettings.reduce((acc, setting) => {
    if (!acc[setting.category]) {
      acc[setting.category] = [];
    }
    acc[setting.category].push(setting);
    return acc;
  }, {} as Record<string, typeof privacySettings>);

  /**
   * Calculate privacy score
   */
  const getPrivacyScore = () => {
    if (!preferences) return 50;
    
    const totalSettings = privacySettings.length;
    const disabledSettings = privacySettings.filter(
      setting => !preferences[setting.key]
    ).length;
    
    return Math.round((disabledSettings / totalSettings) * 100);
  };

  const privacyScore = getPrivacyScore();

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold tracking-tight mb-2">Privacy Settings</h3>
        <p className="text-sm text-muted-foreground">
          Control your privacy and data sharing preferences
        </p>
      </div>

      {/* Privacy Score */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Privacy Score
          </CardTitle>
          <CardDescription>
            Your current privacy level based on enabled settings
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Privacy Level</span>
                <Badge 
                  variant={privacyScore >= 70 ? 'default' : privacyScore >= 40 ? 'secondary' : 'outline'}
                  className="text-xs"
                >
                  {privacyScore >= 70 ? 'High' : privacyScore >= 40 ? 'Medium' : 'Low'} Privacy
                </Badge>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div 
                  className={`h-2 rounded-full transition-all duration-300 ${
                    privacyScore >= 70 ? 'bg-green-500' : 
                    privacyScore >= 40 ? 'bg-yellow-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${privacyScore}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>Less Private</span>
                <span>{privacyScore}%</span>
                <span>More Private</span>
              </div>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-3">
            {privacyScore >= 70 
              ? 'You have a high level of privacy with most data sharing disabled.'
              : privacyScore >= 40 
              ? 'You have moderate privacy with some data sharing enabled.'
              : 'You have lower privacy with most features enabled to improve your experience.'
            }
          </p>
        </CardContent>
      </Card>

      {/* Privacy Settings by Category */}
      {Object.entries(settingsByCategory).map(([categoryKey, settings]) => {
        const category = privacyCategories[categoryKey as keyof typeof privacyCategories];
        
        return (
          <Card key={categoryKey}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <category.icon className="h-5 w-5" />
                {category.label}
              </CardTitle>
              <CardDescription>
                {category.description}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {settings.map((setting) => (
                <div key={setting.key}>
                  <div className="flex items-center justify-between space-x-2">
                    <div className="flex items-center space-x-3 flex-1">
                      <setting.icon className="h-4 w-4 text-muted-foreground" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Label className="font-medium">{setting.label}</Label>
                          <Badge variant={getImpactColor(setting.impact) as 'destructive' | 'default' | 'secondary' | 'outline'} className="text-xs">
                            {setting.impact} impact
                          </Badge>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {setting.description}
                        </div>
                      </div>
                    </div>
                    <Switch
                      checked={preferences?.[setting.key] ?? true}
                      onCheckedChange={(checked) => handlePrivacyToggle(setting.key, checked)}
                    />
                  </div>
                  
                  <div className="ml-7 mt-2">
                    <p className="text-xs text-muted-foreground">
                      {setting.details}
                    </p>
                  </div>
                  
                  {setting !== settings[settings.length - 1] && (
                    <Separator className="mt-4" />
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}

      {/* Privacy Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5" />
            Data Protection Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Your data is protected:</strong> All data is encrypted in transit and at rest. 
              We never sell personal information to third parties.
            </AlertDescription>
          </Alert>
          
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              <strong>Anonymous data only:</strong> When analytics are enabled, all data is 
              anonymized and aggregated to protect your privacy.
            </AlertDescription>
          </Alert>
          
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Required for functionality:</strong> Some features may not work properly 
              if certain data sharing options are disabled.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Privacy Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Privacy Actions</CardTitle>
          <CardDescription>
            Quickly adjust your privacy level with preset configurations
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Button
              variant="outline"
              onClick={() => {
                // Maximum privacy - disable all non-essential features
                onUpdate({
                  sharePresence: false,
                  showOnlineStatus: false,
                  allowAnalytics: false,
                  dataCollection: false,
                  shareUsageStats: false,
                  enableCrashReporting: true, // Keep this for bug fixes
                });
              }}
              className="h-auto p-3 flex flex-col items-center gap-2"
            >
              <Shield className="h-5 w-5" />
              <div className="text-center">
                <div className="font-medium text-sm">Maximum Privacy</div>
                <div className="text-xs text-muted-foreground">Disable all optional sharing</div>
              </div>
            </Button>
            
            <Button
              variant="outline"
              onClick={() => {
                // Balanced privacy - enable helpful features
                onUpdate({
                  sharePresence: true,
                  showOnlineStatus: false,
                  allowAnalytics: true,
                  dataCollection: false,
                  shareUsageStats: true,
                  enableCrashReporting: true,
                });
              }}
              className="h-auto p-3 flex flex-col items-center gap-2"
            >
              <BarChart3 className="h-5 w-5" />
              <div className="text-center">
                <div className="font-medium text-sm">Balanced</div>
                <div className="text-xs text-muted-foreground">Help improve while staying private</div>
              </div>
            </Button>
            
            <Button
              variant="outline"
              onClick={() => {
                // Full sharing - enable all features
                onUpdate({
                  sharePresence: true,
                  showOnlineStatus: true,
                  allowAnalytics: true,
                  dataCollection: true,
                  shareUsageStats: true,
                  enableCrashReporting: true,
                });
              }}
              className="h-auto p-3 flex flex-col items-center gap-2"
            >
              <Users className="h-5 w-5" />
              <div className="text-center">
                <div className="font-medium text-sm">Full Experience</div>
                <div className="text-xs text-muted-foreground">Enable all features</div>
              </div>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Current Settings Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Current Privacy Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            {privacySettings.map((setting) => (
              <div key={setting.key} className="flex items-center justify-between">
                <span className="text-muted-foreground">{setting.label}:</span>
                <Badge 
                  variant={preferences?.[setting.key] ? 'secondary' : 'outline'} 
                  className="text-xs"
                >
                  {preferences?.[setting.key] ? 'Enabled' : 'Disabled'}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Reset Button */}
      <div className="flex justify-end">
        <Button variant="outline" onClick={onReset} className="flex items-center gap-2">
          <RotateCcw className="h-4 w-4" />
          Reset Privacy Settings
        </Button>
      </div>
    </div>
  );
}