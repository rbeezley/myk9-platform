// Template versioning and usage tracking system
// Phase 4.1: Template System Integration

import type { 
  ClassTemplate,
  // ClassTemplateField // Currently unused in this file 
} from '@/types/class-template-types';
import type { 
  // ShowTemplateDefinition, // Currently unused in this file
  // ShowFieldDefinition // Currently unused in this file 
} from '@/types/show-template-types';
import { compareTemplates } from './templateInheritance';

// ===== TEMPLATE VERSIONING SYSTEM =====

/**
 * Template version metadata
 */
export interface TemplateVersion {
  id: string;
  templateId: string;
  version: string;
  name: string;
  description?: string;
  changes: TemplateChange[];
  createdBy: string;
  createdAt: Date;
  isActive: boolean;
  isCurrent: boolean;
  usageCount: number;
  parentVersion?: string;
}

/**
 * Template change record
 */
export interface TemplateChange {
  type: 'field_added' | 'field_removed' | 'field_modified' | 'property_changed' | 'metadata_updated';
  field?: string;
  property?: string;
  oldValue?: unknown;
  newValue?: unknown;
  description: string;
  timestamp: Date;
}

/**
 * Template usage tracking
 */
export interface TemplateUsage {
  id: string;
  templateId: string;
  templateVersion?: string;
  usedBy: string; // User ID
  usedInShow?: string; // Show ID
  usedInClass?: string; // Class ID
  usageType: 'create_show' | 'create_class' | 'template_copy' | 'template_inherit';
  metadata?: Record<string, unknown>;
  usedAt: Date;
}

/**
 * Version numbering strategies
 */
export type VersionStrategy = 'semantic' | 'sequential' | 'timestamp' | 'custom';

// ===== VERSION GENERATION =====

/**
 * Generate the next version number based on strategy
 */
export const generateNextVersion = (
  currentVersion: string,
  strategy: VersionStrategy = 'semantic',
  changeType: 'major' | 'minor' | 'patch' = 'patch'
): string => {
  switch (strategy) {
    case 'semantic':
      return generateSemanticVersion(currentVersion, changeType);
    case 'sequential':
      return generateSequentialVersion(currentVersion);
    case 'timestamp':
      return generateTimestampVersion();
    case 'custom':
      return generateCustomVersion(currentVersion);
    default:
      return generateSemanticVersion(currentVersion, changeType);
  }
};

/**
 * Generate semantic version (major.minor.patch)
 */
const generateSemanticVersion = (
  currentVersion: string,
  changeType: 'major' | 'minor' | 'patch'
): string => {
  const [major, minor, patch] = currentVersion.split('.').map(Number);
  
  switch (changeType) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
    default:
      return `${major}.${minor}.${patch + 1}`;
  }
};

/**
 * Generate sequential version (1, 2, 3, ...)
 */
const generateSequentialVersion = (currentVersion: string): string => {
  const current = parseInt(currentVersion) || 0;
  return String(current + 1);
};

/**
 * Generate timestamp-based version
 */
const generateTimestampVersion = (): string => {
  return new Date().toISOString().replace(/[:.]/g, '-');
};

/**
 * Generate custom version format
 */
const generateCustomVersion = (currentVersion: string): string => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  // Extract existing version number or start at 1
  const versionMatch = currentVersion.match(/v(\d+)$/);
  const versionNum = versionMatch ? parseInt(versionMatch[1]) + 1 : 1;
  
  return `${year}.${month}.${day}.v${versionNum}`;
};

// ===== CHANGE DETECTION =====

/**
 * Detect changes between template versions
 */
export const detectTemplateChanges = (
  oldTemplate: ClassTemplate,
  newTemplate: ClassTemplate
): TemplateChange[] => {
  const changes: TemplateChange[] = [];
  const comparison = compareTemplates(oldTemplate, newTemplate);
  const timestamp = new Date();

  // Process field changes
  comparison.fieldDifferences.added.forEach(field => {
    changes.push({
      type: 'field_added',
      field: field.name,
      newValue: field,
      description: `Added field '${field.name}' of type '${field.type}'`,
      timestamp,
    });
  });

  comparison.fieldDifferences.removed.forEach(field => {
    changes.push({
      type: 'field_removed',
      field: field.name,
      oldValue: field,
      description: `Removed field '${field.name}'`,
      timestamp,
    });
  });

  comparison.fieldDifferences.modified.forEach(({ field, changes: fieldChanges }) => {
    Object.entries(fieldChanges).forEach(([property, { old, new: newVal }]) => {
      changes.push({
        type: 'field_modified',
        field,
        property,
        oldValue: old,
        newValue: newVal,
        description: `Modified field '${field}' property '${property}'`,
        timestamp,
      });
    });
  });

  // Process property changes
  Object.entries(comparison.propertyDifferences).forEach(([property, { old, new: newVal }]) => {
    changes.push({
      type: 'property_changed',
      property,
      oldValue: old,
      newValue: newVal,
      description: `Changed property '${property}'`,
      timestamp,
    });
  });

  return changes;
};

/**
 * Determine change type based on modifications
 */
export const determineChangeType = (changes: TemplateChange[]): 'major' | 'minor' | 'patch' => {
  const hasBreakingChanges = changes.some(change => 
    change.type === 'field_removed' || 
    (change.type === 'field_modified' && change.property === 'type')
  );

  if (hasBreakingChanges) {
    return 'major';
  }

  const hasNewFeatures = changes.some(change => 
    change.type === 'field_added' || 
    change.type === 'property_changed'
  );

  if (hasNewFeatures) {
    return 'minor';
  }

  return 'patch';
};

// ===== TEMPLATE VERSION MANAGEMENT =====

/**
 * Create a new version of a template
 */
export const createTemplateVersion = (
  oldTemplate: ClassTemplate,
  newTemplate: ClassTemplate,
  versionStrategy: VersionStrategy = 'semantic',
  createdBy: string,
  description?: string
): TemplateVersion => {
  const changes = detectTemplateChanges(oldTemplate, newTemplate);
  const changeType = determineChangeType(changes);
  const newVersion = generateNextVersion(
    oldTemplate.updatedAt.toISOString(), // Use timestamp as base version for now
    versionStrategy,
    changeType
  );

  return {
    id: `${newTemplate.id}_v${newVersion}`,
    templateId: newTemplate.id,
    version: newVersion,
    name: newTemplate.name,
    description: description || `Updated template with ${changes.length} changes`,
    changes,
    createdBy,
    createdAt: new Date(),
    isActive: true,
    isCurrent: true,
    usageCount: 0,
    parentVersion: oldTemplate.updatedAt.toISOString(),
  };
};

/**
 * Get version history for a template
 */
export const getTemplateVersionHistory = (
  templateId: string,
  versions: TemplateVersion[]
): TemplateVersion[] => {
  return versions
    .filter(v => v.templateId === templateId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
};

/**
 * Compare two template versions
 */
export const compareTemplateVersions = (
  version1: TemplateVersion,
  version2: TemplateVersion
): {
  versionDiff: {
    from: string;
    to: string;
    changeCount: number;
  };
  changes: TemplateChange[];
} => {
  // For now, we'll aggregate changes from both versions
  // In a full implementation, we'd store template snapshots to do proper comparison
  const allChanges = [...version1.changes, ...version2.changes];
  
  return {
    versionDiff: {
      from: version1.version,
      to: version2.version,
      changeCount: allChanges.length,
    },
    changes: allChanges,
  };
};

// ===== USAGE TRACKING =====

/**
 * Track template usage
 */
export const trackTemplateUsage = (
  templateId: string,
  usedBy: string,
  usageType: TemplateUsage['usageType'],
  metadata?: Record<string, unknown>
): TemplateUsage => {
  return {
    id: `usage_${templateId}_${Date.now()}`,
    templateId,
    usedBy,
    usageType,
    ...(metadata !== undefined && { metadata }),
    usedAt: new Date(),
  };
};

/**
 * Get usage statistics for a template
 */
export const getTemplateUsageStats = (
  templateId: string,
  usageRecords: TemplateUsage[]
): {
  totalUsage: number;
  usageByType: Record<string, number>;
  usageByUser: Record<string, number>;
  recentUsage: TemplateUsage[];
  popularityScore: number;
} => {
  const templateUsage = usageRecords.filter(u => u.templateId === templateId);
  
  const usageByType = templateUsage.reduce((acc, usage) => {
    acc[usage.usageType] = (acc[usage.usageType] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const usageByUser = templateUsage.reduce((acc, usage) => {
    acc[usage.usedBy] = (acc[usage.usedBy] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const recentUsage = templateUsage
    .sort((a, b) => b.usedAt.getTime() - a.usedAt.getTime())
    .slice(0, 10);

  // Calculate popularity score based on usage frequency and recency
  const now = Date.now();
  const popularityScore = templateUsage.reduce((score, usage) => {
    const daysSinceUsage = (now - usage.usedAt.getTime()) / (1000 * 60 * 60 * 24);
    const recencyWeight = Math.max(0, 1 - daysSinceUsage / 365); // Decay over a year
    return score + recencyWeight;
  }, 0);

  return {
    totalUsage: templateUsage.length,
    usageByType,
    usageByUser,
    recentUsage,
    popularityScore,
  };
};

/**
 * Get trending templates based on usage patterns
 */
export const getTrendingTemplates = (
  usageRecords: TemplateUsage[],
  timeWindow: number = 30 // days
): Array<{
  templateId: string;
  usageCount: number;
  trend: 'rising' | 'stable' | 'declining';
  trendPercentage: number;
}> => {
  const cutoffDate = new Date(Date.now() - timeWindow * 24 * 60 * 60 * 1000);
  const recentUsage = usageRecords.filter(u => u.usedAt >= cutoffDate);
  
  // Group by template
  const templateUsage = recentUsage.reduce((acc, usage) => {
    acc[usage.templateId] = (acc[usage.templateId] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Calculate trends (simplified - would need historical data for proper trending)
  return Object.entries(templateUsage)
    .map(([templateId, count]) => ({
      templateId,
      usageCount: count,
      trend: 'stable' as const, // Would calculate based on historical comparison
      trendPercentage: 0, // Would calculate percentage change
    }))
    .sort((a, b) => b.usageCount - a.usageCount);
};

// ===== VERSION ROLLBACK AND RECOVERY =====

/**
 * Check if a template version can be safely rolled back
 */
export const canRollbackVersion = (
  targetVersion: TemplateVersion,
  currentUsage: TemplateUsage[]
): { canRollback: boolean; blockers: string[] } => {
  const blockers: string[] = [];
  
  // Check if there are recent usages that might be affected
  const recentUsage = currentUsage.filter(u => 
    u.templateId === targetVersion.templateId &&
    u.usedAt > new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
  );

  if (recentUsage.length > 0) {
    blockers.push(`Template has been used ${recentUsage.length} times in the last 24 hours`);
  }

  // Check for breaking changes since target version
  const hasBreakingChanges = targetVersion.changes.some(change => 
    change.type === 'field_removed' || 
    (change.type === 'field_modified' && change.property === 'type')
  );

  if (hasBreakingChanges) {
    blockers.push('Target version contains breaking changes that may affect existing usage');
  }

  return {
    canRollback: blockers.length === 0,
    blockers,
  };
};

/**
 * Create a rollback version
 */
export const createRollbackVersion = (
  targetVersion: TemplateVersion,
  currentTemplate: ClassTemplate,
  rolledBackBy: string
): TemplateVersion => {
  return {
    id: `${currentTemplate.id}_rollback_${Date.now()}`,
    templateId: currentTemplate.id,
    version: generateNextVersion(targetVersion.version, 'semantic', 'patch'),
    name: `${currentTemplate.name} (Rolled back)`,
    description: `Rolled back to version ${targetVersion.version}`,
    changes: [{
      type: 'metadata_updated',
      description: `Rolled back to version ${targetVersion.version}`,
      timestamp: new Date(),
    }],
    createdBy: rolledBackBy,
    createdAt: new Date(),
    isActive: true,
    isCurrent: true,
    usageCount: 0,
    parentVersion: targetVersion.version,
  };
};

// ===== ANALYTICS AND REPORTING =====

/**
 * Generate template usage analytics
 */
export const generateTemplateAnalytics = (
  templates: ClassTemplate[],
  versions: TemplateVersion[],
  usageRecords: TemplateUsage[]
): {
  totalTemplates: number;
  totalVersions: number;
  totalUsage: number;
  averageUsagePerTemplate: number;
  mostUsedTemplates: Array<{ templateId: string; name: string; usageCount: number }>;
  versionDistribution: Record<string, number>;
  usageOverTime: Array<{ date: string; count: number }>;
} => {
  const templateUsageMap = usageRecords.reduce((acc, usage) => {
    acc[usage.templateId] = (acc[usage.templateId] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const mostUsedTemplates = templates
    .map(template => ({
      templateId: template.id,
      name: template.name,
      usageCount: templateUsageMap[template.id] || 0,
    }))
    .sort((a, b) => b.usageCount - a.usageCount)
    .slice(0, 10);

  const versionDistribution = versions.reduce((acc, version) => {
    acc[version.version] = (acc[version.version] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Group usage by date
  const usageByDate = usageRecords.reduce((acc, usage) => {
    const date = usage.usedAt.toISOString().split('T')[0];
    acc[date] = (acc[date] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const usageOverTime = Object.entries(usageByDate)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    totalTemplates: templates.length,
    totalVersions: versions.length,
    totalUsage: usageRecords.length,
    averageUsagePerTemplate: usageRecords.length / templates.length || 0,
    mostUsedTemplates,
    versionDistribution,
    usageOverTime,
  };
};