// Alert Rule Management Component

import React, { useState, useEffect, useCallback } from 'react';
import { logger } from '@/services/LoggingService';
import {
  Plus,
  Edit,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Bell,
  Clock,
  MoreHorizontal,
  Save,
  X,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Textarea } from '../ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Switch } from '../ui/switch';
import { ScrollArea } from '../ui/scroll-area';
import AlertingService from '../../services/alerts/AlertingService';
import {
  AlertRule,
  AlertType,
  AlertSeverity,
  NotificationChannel,
  AlertThreshold,
} from '../../types/alert-types';
import { cn } from '../../lib/utils';

interface AlertRuleManagerProps {
  className?: string;
}

interface RuleFormData {
  name: string;
  description: string;
  type: AlertType;
  severity: AlertSeverity;
  enabled: boolean;
  thresholds: AlertThreshold[];
  channels: NotificationChannel[];
  cooldown: number;
  groupBy: string[];
}

const defaultFormData: RuleFormData = {
  name: '',
  description: '',
  type: AlertType.SYNC_FAILURE,
  severity: AlertSeverity.MEDIUM,
  enabled: true,
  thresholds: [],
  channels: [NotificationChannel.IN_APP],
  cooldown: 300000, // 5 minutes
  groupBy: [],
};

export const AlertRuleManager: React.FC<AlertRuleManagerProps> = ({ className }) => {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingRule, setEditingRule] = useState<AlertRule | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [formData, setFormData] = useState<RuleFormData>(defaultFormData);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const alertingService = AlertingService.getInstance();

  const loadRules = useCallback(async () => {
    try {
      setLoading(true);
      // In real implementation, this would fetch from alertingService
      // For now, we'll simulate loading rules
      await alertingService.initialize();
      // This is a mock - in real implementation you'd have a getRules method
      setRules([]);
    } catch (error) {
      logger.error('Failed to load alert rules:', 'alerts', {}, error as Error);
    } finally {
      setLoading(false);
    }
  }, [alertingService]);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  const handleCreateRule = () => {
    setFormData(defaultFormData);
    setEditingRule(null);
    setShowCreateDialog(true);
    setErrors({});
  };

  const handleEditRule = (rule: AlertRule) => {
    setFormData({
      name: rule.name,
      description: rule.description,
      type: rule.type,
      severity: rule.severity,
      enabled: rule.enabled,
      thresholds: rule.thresholds,
      channels: rule.channels,
      cooldown: rule.cooldown || 300000,
      groupBy: rule.groupBy || [],
    });
    setEditingRule(rule);
    setShowCreateDialog(true);
    setErrors({});
  };

  const handleSaveRule = async () => {
    if (!validateForm()) return;

    try {
      const ruleData = {
        ...formData,
        metadata: {},
      };

      if (editingRule) {
        await alertingService.updateRule(editingRule.id, ruleData);
      } else {
        await alertingService.createRule(ruleData);
      }

      await loadRules();
      setShowCreateDialog(false);
      setEditingRule(null);
    } catch (error) {
      logger.error('Failed to save rule:', 'alerts', {}, error as Error);
      setErrors({ general: 'Failed to save rule. Please try again.' });
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    if (!confirm('Are you sure you want to delete this alert rule?')) return;

    try {
      await alertingService.deleteRule(ruleId);
      await loadRules();
    } catch (error) {
      logger.error('Failed to delete rule:', 'alerts', {}, error as Error);
    }
  };

  const handleToggleRule = async (rule: AlertRule) => {
    try {
      await alertingService.updateRule(rule.id, { enabled: !rule.enabled });
      await loadRules();
    } catch (error) {
      logger.error('Failed to toggle rule:', 'alerts', {}, error as Error);
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Rule name is required';
    }

    if (!formData.description.trim()) {
      newErrors.description = 'Description is required';
    }

    if (formData.thresholds.length === 0) {
      newErrors.thresholds = 'At least one threshold is required';
    }

    if (formData.channels.length === 0) {
      newErrors.channels = 'At least one notification channel is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const addThreshold = () => {
    setFormData(prev => ({
      ...prev,
      thresholds: [
        ...prev.thresholds,
        {
          metric: '',
          operator: 'gt',
          value: 0,
          window: 300000,
        },
      ],
    }));
  };

  const updateThreshold = (index: number, updates: Partial<AlertThreshold>) => {
    setFormData(prev => ({
      ...prev,
      thresholds: prev.thresholds.map((threshold, i) =>
        i === index ? { ...threshold, ...updates } : threshold
      ),
    }));
  };

  const removeThreshold = (index: number) => {
    setFormData(prev => ({
      ...prev,
      thresholds: prev.thresholds.filter((_, i) => i !== index),
    }));
  };

  const getTypeLabel = (type: AlertType): string => {
    switch (type) {
      case AlertType.SYNC_FAILURE:
        return 'Sync Failure';
      case AlertType.CONFLICT_SURGE:
        return 'Conflict Surge';
      case AlertType.PERFORMANCE_DEGRADATION:
        return 'Performance';
      case AlertType.DATA_INTEGRITY:
        return 'Data Integrity';
      case AlertType.NETWORK_CONNECTIVITY:
        return 'Network';
      case AlertType.STORAGE_QUOTA:
        return 'Storage';
      default:
        return 'Custom';
    }
  };

  const getSeverityColor = (severity: AlertSeverity): string => {
    switch (severity) {
      case AlertSeverity.CRITICAL:
        return 'bg-red-500/10 text-red-700 border-red-200';
      case AlertSeverity.HIGH:
        return 'bg-orange-500/10 text-orange-700 border-orange-200';
      case AlertSeverity.MEDIUM:
        return 'bg-yellow-500/10 text-yellow-700 border-yellow-200';
      default:
        return 'bg-blue-500/10 text-blue-700 border-blue-200';
    }
  };

  const getChannelLabel = (channel: NotificationChannel): string => {
    switch (channel) {
      case NotificationChannel.IN_APP:
        return 'In-App';
      case NotificationChannel.BROWSER:
        return 'Browser';
      case NotificationChannel.EMAIL:
        return 'Email';
      case NotificationChannel.SOUND:
        return 'Sound';
      default:
        return channel;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading alert rules...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('space-y-6', className)}>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight" style={{ fontWeight: 650 }}>
            Alert Rules
          </h2>
          <p className="text-muted-foreground" style={{ fontWeight: 400 }}>
            Configure alert rules to monitor system health and performance
          </p>
        </div>
        <Button onClick={handleCreateRule}>
          <Plus className="mr-2 h-4 w-4" />
          Create Rule
        </Button>
      </div>

      {rules.length === 0 ? (
        <div className="text-center py-16">
          <div className="mb-6">
            <div
              className="w-32 h-32 bg-gradient-to-br from-primary/10 to-secondary/10 
                             rounded-full mx-auto flex items-center justify-center 
                             shadow-sm hover:shadow-xl hover:scale-105 
                             transition-all duration-300"
            >
              <Bell className="h-16 w-16 text-primary" />
            </div>
          </div>
          <h3 className="text-xl font-semibold mb-3" style={{ fontWeight: 590 }}>
            No alert rules configured
          </h3>
          <p className="text-muted-foreground mb-8 max-w-md mx-auto">
            Create your first alert rule to start monitoring system health
          </p>
          <Button onClick={handleCreateRule}>
            <Plus className="mr-2 h-4 w-4" />
            Create Your First Rule
          </Button>
        </div>
      ) : (
        <div className="grid gap-4">
          {rules.map(rule => (
            <Card key={rule.id} className={cn(!rule.enabled && 'opacity-60')}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <CardTitle className="text-lg">{rule.name}</CardTitle>
                      <Badge
                        variant="outline"
                        className={cn('text-xs', getSeverityColor(rule.severity))}
                      >
                        {rule.severity.toUpperCase()}
                      </Badge>
                      <Badge variant="secondary" className="text-xs">
                        {getTypeLabel(rule.type)}
                      </Badge>
                      {rule.enabled ? (
                        <Badge
                          variant="outline"
                          className="text-xs bg-green-50 text-green-700 border-green-200"
                        >
                          Active
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="text-xs bg-gray-50 text-gray-700 border-gray-200"
                        >
                          Disabled
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{rule.description}</p>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Button variant="ghost" size="sm" onClick={() => handleToggleRule(rule)}>
                      {rule.enabled ? (
                        <ToggleRight className="h-4 w-4 text-green-600" />
                      ) : (
                        <ToggleLeft className="h-4 w-4 text-gray-400" />
                      )}
                    </Button>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild nativeButton>
                        <Button variant="ghost" size="sm">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEditRule(rule)}>
                          <Edit className="mr-2 h-4 w-4" />
                          Edit Rule
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => handleDeleteRule(rule.id)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete Rule
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </CardHeader>

              <CardContent>
                <div className="space-y-4">
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Thresholds
                    </Label>
                    <div className="mt-1 space-y-2">
                      {rule.thresholds.map((threshold, index) => (
                        <div key={index} className="text-sm bg-muted/50 rounded-md p-2">
                          <code>
                            {threshold.metric} {threshold.operator} {threshold.value}
                            {threshold.window && ` (${threshold.window / 1000}s window)`}
                          </code>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Notification Channels
                    </Label>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {rule.channels.map(channel => (
                        <Badge key={channel} variant="outline" className="text-xs">
                          {getChannelLabel(channel)}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {rule.cooldown && (
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Cooldown
                      </Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        <Clock className="inline h-3 w-3 mr-1" />
                        {rule.cooldown / 60000} minutes between alerts
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Rule Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{editingRule ? 'Edit Alert Rule' : 'Create Alert Rule'}</DialogTitle>
          </DialogHeader>

          <ScrollArea className="max-h-[60vh] pr-4">
            <div className="space-y-6">
              {errors.general && (
                <div className="bg-destructive/5 border border-destructive/20 rounded-md p-3">
                  <p className="text-sm text-destructive">{errors.general}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Rule Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    className={errors.name ? 'border-destructive' : ''}
                  />
                  {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="type">Alert Type</Label>
                  <Select
                    value={formData.type}
                    onValueChange={value =>
                      setFormData(prev => ({ ...prev, type: value as AlertType }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={AlertType.SYNC_FAILURE}>Sync Failure</SelectItem>
                      <SelectItem value={AlertType.CONFLICT_SURGE}>Conflict Surge</SelectItem>
                      <SelectItem value={AlertType.PERFORMANCE_DEGRADATION}>Performance</SelectItem>
                      <SelectItem value={AlertType.DATA_INTEGRITY}>Data Integrity</SelectItem>
                      <SelectItem value={AlertType.NETWORK_CONNECTIVITY}>Network</SelectItem>
                      <SelectItem value={AlertType.STORAGE_QUOTA}>Storage</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description *</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  className={errors.description ? 'border-destructive' : ''}
                />
                {errors.description && (
                  <p className="text-sm text-destructive">{errors.description}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="severity">Severity</Label>
                  <Select
                    value={formData.severity}
                    onValueChange={value =>
                      setFormData(prev => ({ ...prev, severity: value as AlertSeverity }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={AlertSeverity.LOW}>Low</SelectItem>
                      <SelectItem value={AlertSeverity.MEDIUM}>Medium</SelectItem>
                      <SelectItem value={AlertSeverity.HIGH}>High</SelectItem>
                      <SelectItem value={AlertSeverity.CRITICAL}>Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cooldown">Cooldown (minutes)</Label>
                  <Input
                    id="cooldown"
                    type="number"
                    value={formData.cooldown / 60000}
                    onChange={e =>
                      setFormData(prev => ({
                        ...prev,
                        cooldown: parseInt(e.target.value) * 60000,
                      }))
                    }
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="enabled"
                  checked={formData.enabled}
                  onCheckedChange={checked => setFormData(prev => ({ ...prev, enabled: checked }))}
                />
                <Label htmlFor="enabled">Enable this rule</Label>
              </div>

              {/* Thresholds Section */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Thresholds *</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addThreshold}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add Threshold
                  </Button>
                </div>

                {formData.thresholds.map((threshold, index) => (
                  <Card key={index} className="p-4">
                    <div className="grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-4">
                        <Label>Metric</Label>
                        <Input
                          value={threshold.metric}
                          onChange={e => updateThreshold(index, { metric: e.target.value })}
                          placeholder="e.g., sync.failureRate"
                        />
                      </div>

                      <div className="col-span-2">
                        <Label>Operator</Label>
                        <Select
                          value={threshold.operator}
                          onValueChange={value =>
                            updateThreshold(index, {
                              operator: value as 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'neq',
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="gt">&gt;</SelectItem>
                            <SelectItem value="gte">&gt;=</SelectItem>
                            <SelectItem value="lt">&lt;</SelectItem>
                            <SelectItem value="lte">&lt;=</SelectItem>
                            <SelectItem value="eq">=</SelectItem>
                            <SelectItem value="neq">!=</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="col-span-2">
                        <Label>Value</Label>
                        <Input
                          type="number"
                          value={threshold.value}
                          onChange={e =>
                            updateThreshold(index, { value: parseFloat(e.target.value) })
                          }
                        />
                      </div>

                      <div className="col-span-3">
                        <Label>Window (seconds)</Label>
                        <Input
                          type="number"
                          value={threshold.window ? threshold.window / 1000 : ''}
                          onChange={e =>
                            updateThreshold(index, {
                              window: e.target.value ? parseInt(e.target.value) * 1000 : undefined,
                            })
                          }
                          placeholder="Optional"
                        />
                      </div>

                      <div className="col-span-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeThreshold(index)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}

                {errors.thresholds && (
                  <p className="text-sm text-destructive">{errors.thresholds}</p>
                )}
              </div>

              {/* Notification Channels */}
              <div className="space-y-2">
                <Label>Notification Channels *</Label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.values(NotificationChannel).map(channel => (
                    <div key={channel} className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id={channel}
                        checked={formData.channels.includes(channel)}
                        onChange={e => {
                          if (e.target.checked) {
                            setFormData(prev => ({
                              ...prev,
                              channels: [...prev.channels, channel],
                            }));
                          } else {
                            setFormData(prev => ({
                              ...prev,
                              channels: prev.channels.filter(c => c !== channel),
                            }));
                          }
                        }}
                      />
                      <Label htmlFor={channel}>{getChannelLabel(channel)}</Label>
                    </div>
                  ))}
                </div>
                {errors.channels && <p className="text-sm text-destructive">{errors.channels}</p>}
              </div>
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveRule}>
              <Save className="mr-2 h-4 w-4" />
              {editingRule ? 'Update Rule' : 'Create Rule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AlertRuleManager;
