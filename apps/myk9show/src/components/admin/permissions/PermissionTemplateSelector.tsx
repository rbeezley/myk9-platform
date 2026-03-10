/**
 * Permission Template Selector Component
 * Phase 4.6: Permission templates system
 * Created: December 2024
 */

import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Sparkles,
  Shield,
  Users,
  Eye,
  Settings,
  Briefcase,
  Crown,
  CheckCircle,
} from 'lucide-react';

interface PermissionTemplate {
  id: string;
  name: string;
  displayName: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  permissions: string[];
  category: 'system' | 'custom';
}

interface PermissionTemplateSelectorProps {
  onTemplateSelect: (template: PermissionTemplate) => void;
}

const PERMISSION_TEMPLATES: PermissionTemplate[] = [
  {
    id: 'basic-secretary',
    name: 'basic-secretary',
    displayName: 'Basic Secretary',
    description: 'Standard secretary permissions for show management',
    icon: Briefcase,
    color: 'bg-blue-100 text-blue-700 border-blue-200',
    category: 'system',
    permissions: [
      'show:create',
      'show:read',
      'show:update',
      'show:delete',
      'show:manage',
      'trial:create',
      'trial:read',
      'trial:update',
      'trial:delete',
      'trial:manage',
      'class:create',
      'class:read',
      'class:update',
      'class:delete',
      'class:manage',
      'entry:read',
      'entry:update',
      'entry:manage',
      'judge:assign',
      'judge:view',
      'judge:manage',
      'report:generate',
      'report:export',
      'template:create',
      'template:read',
      'template:update',
      'template:delete',
      'template:manage',
    ],
  },
  {
    id: 'show-manager',
    name: 'show-manager',
    displayName: 'Show Manager',
    description: 'Full show management capabilities with advanced permissions',
    icon: Crown,
    color: 'bg-violet-100 text-violet-700 border-violet-200',
    category: 'system',
    permissions: [
      'show:manage',
      'trial:manage',
      'class:manage',
      'entry:manage',
      'judge:manage',
      'report:manage',
      'club:read',
      'people:read',
      'dog:read',
    ],
  },
  {
    id: 'read-only-admin',
    name: 'read-only-admin',
    displayName: 'Read-Only Administrator',
    description: 'Can view all data but cannot modify anything',
    icon: Eye,
    color: 'bg-teal-100 text-teal-700 border-teal-200',
    category: 'system',
    permissions: [
      'show:read',
      'trial:read',
      'class:read',
      'entry:read',
      'dog:read',
      'people:read',
      'club:read',
      'judge:read',
      'report:generate',
      'template:read',
    ],
  },
  {
    id: 'event-coordinator',
    name: 'event-coordinator',
    displayName: 'Event Coordinator',
    description: 'Manages events and coordination but limited admin access',
    icon: Users,
    color: 'bg-orange-100 text-orange-700 border-orange-200',
    category: 'system',
    permissions: [
      'show:read',
      'show:update',
      'trial:read',
      'trial:update',
      'class:read',
      'class:update',
      'entry:read',
      'entry:update',
      'judge:read',
      'judge:assign',
      'people:read',
      'club:read',
    ],
  },
  {
    id: 'judge-panel',
    name: 'judge-panel',
    displayName: 'Judge Panel Member',
    description: 'Access to judging information and related show data',
    icon: Shield,
    color: 'bg-indigo-100 text-indigo-700 border-indigo-200',
    category: 'system',
    permissions: [
      'show:read',
      'trial:read',
      'class:read',
      'entry:read',
      'dog:read',
      'people:read',
      'judge:read',
      'judge:view',
    ],
  },
  {
    id: 'data-analyst',
    name: 'data-analyst',
    displayName: 'Data Analyst',
    description: 'Read access to all data with reporting capabilities',
    icon: Settings,
    color: 'bg-teal-100 text-teal-700 border-teal-200',
    category: 'system',
    permissions: [
      'show:read',
      'trial:read',
      'class:read',
      'entry:read',
      'dog:read',
      'people:read',
      'club:read',
      'judge:read',
      'report:generate',
      'report:export',
      'template:read',
    ],
  },
];

export const PermissionTemplateSelector: React.FC<PermissionTemplateSelectorProps> = ({
  onTemplateSelect,
}) => {
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  const handleTemplateSelect = (template: PermissionTemplate) => {
    setSelectedTemplate(template.id);
    onTemplateSelect(template);
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-medium flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          Permission Templates
        </h3>
        <p className="text-sm text-muted-foreground">
          Choose a pre-built template to get started quickly
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 max-h-80 overflow-y-auto">
        {PERMISSION_TEMPLATES.map(template => {
          const Icon = template.icon;
          const isSelected = selectedTemplate === template.id;

          return (
            <Card
              key={template.id}
              className={`cursor-pointer transition-all hover:shadow-md ${
                isSelected ? 'ring-2 ring-primary shadow-md' : ''
              }`}
              onClick={() => handleTemplateSelect(template)}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${template.color}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="font-medium text-sm">{template.displayName}</h4>
                      {isSelected && <CheckCircle className="h-4 w-4 text-primary" />}
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">{template.description}</p>
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="text-xs">
                        {template.permissions.length} permissions
                      </Badge>
                      <Badge
                        variant={template.category === 'system' ? 'secondary' : 'default'}
                        className="text-xs"
                      >
                        {template.category}
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {selectedTemplate && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-start gap-2">
            <CheckCircle className="h-4 w-4 text-blue-600 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-blue-900">Template Selected</p>
              <p className="text-xs text-blue-700">
                {PERMISSION_TEMPLATES.find(t => t.id === selectedTemplate)?.permissions.length}{' '}
                permissions will be pre-selected. You can modify these in the next step.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
