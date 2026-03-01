import React, { useState, useEffect } from 'react';
import { logger } from '@/services/LoggingService';
import { useTemplateStore } from '@/store/templateStore';
import { useTemplates } from '@/hooks/useTemplates';
import { Organization, TrialType, TemplateFilter } from '@/types/template.types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Plus,
  Filter,
  MoreVertical,
  Edit,
  TestTube,
  Copy,
  Download,
  Trash2,
  FileText,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import '@/styles/apple-template-management.css';
import { cleanupDuplicateTemplates } from '@/utils/cleanup-duplicate-templates';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
// Dialogs temporarily removed to fix import issues
// import { ExportTemplatesDialog } from '@/components/templates/ExportTemplatesDialog';
// import { AutoSaveTemplatesDialog } from '@/components/templates/AutoSaveTemplatesDialog';
// import { DirectSaveTemplatesDialog } from '@/components/templates/DirectSaveTemplatesDialog';

const TemplateManagementPage: React.FC = () => {
  logger.debug('Template page loaded', 'templates');
  const navigate = useNavigate();
  const {
    searchTemplates,
    clearError,
    error,
    clearCorruptedData,
    initializeDefaultTemplates,
    deleteTemplate,
  } = useTemplateStore();
  const { templates, isLoading } = useTemplates(); // Use lazy loading hook

  // Debug template duplication
  logger.debug('All templates', 'templates', {
    templates: templates.map(t => ({ id: t.id, name: t.templateName, isOfficial: t.isOfficial })),
  });

  // Clean duplicates on mount
  useEffect(() => {
    const uniqueTemplates = templates.filter(
      (template, index, array) => array.findIndex(t => t.id === template.id) === index
    );

    if (uniqueTemplates.length < templates.length) {
      logger.info('Found duplicate templates, cleaning', 'templates', {
        duplicateCount: templates.length - uniqueTemplates.length,
      });
      // This would need to be implemented in the store
    }
  }, [templates]);

  const [filter, setFilter] = useState<TemplateFilter>({
    searchTerm: '',
    // Optional properties are omitted rather than set to undefined
    // to satisfy exactOptionalPropertyTypes
  });

  const [filteredTemplates, setFilteredTemplates] = useState(templates);

  // Delete confirmation dialog state
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    template: (typeof templates)[0] | null;
  }>({
    open: false,
    template: null,
  });

  const [showResetDialog, setShowResetDialog] = useState(false);

  // Dialog states temporarily removed
  // const [showExportDialog, setShowExportDialog] = useState(false);
  // const [showAutoSaveDialog, setShowAutoSaveDialog] = useState(false);
  // const [showDirectSaveDialog, setShowDirectSaveDialog] = useState(false);

  // Update filtered templates when filter changes
  useEffect(() => {
    const results = searchTemplates(filter);
    queueMicrotask(() => {
      setFilteredTemplates(results);
    });
  }, [filter, templates, searchTemplates]);

  const handleFilterChange = (
    key: keyof TemplateFilter,
    value: string | boolean | Organization | TrialType | undefined
  ) => {
    setFilter(prev => ({
      ...prev,
      [key]: value === 'all' ? undefined : value,
    }));
  };

  const handleCreateNew = () => {
    navigate('/admin/templates/new');
  };

  const handleEditTemplate = (templateId: string) => {
    navigate(`/admin/templates/${templateId}/edit`);
  };

  const handleTestTemplate = (templateId: string) => {
    navigate(`/admin/templates/${templateId}/test`);
  };

  const handleDeleteTemplate = (templateId: string) => {
    const template = templates.find(t => t.id === templateId);
    if (!template) {
      logger.warn('Template not found', 'templates', { templateId });
      return;
    }

    if (template.isOfficial) {
      logger.warn('Attempted to delete official template - blocked', 'templates');
      return;
    }

    // Open confirmation dialog
    setDeleteDialog({
      open: true,
      template: template,
    });
  };

  const handleConfirmDelete = () => {
    if (!deleteDialog.template) return;

    logger.info('Attempting to delete template', 'templates', {
      templateId: deleteDialog.template.id,
    });
    const success = deleteTemplate(deleteDialog.template.id);
    logger.debug('Delete result', 'templates', { success });

    if (!success) {
      logger.error('Failed to delete template', 'templates', {
        templateId: deleteDialog.template.id,
      });
    } else {
      logger.info('Template deleted successfully', 'templates', {
        templateId: deleteDialog.template.id,
      });
    }

    // Close dialog
    setDeleteDialog({ open: false, template: null });
  };

  const organizations: Organization[] = Object.values(Organization);
  const trialTypes: TrialType[] = Object.values(TrialType);

  const officialCount = templates.filter(t => t.isOfficial && t.isActive).length;
  const customCount = templates.filter(t => t.isCustom && t.isActive).length;
  const totalCount = templates.filter(t => t.isActive).length;

  // Debug logging
  React.useEffect(() => {
    logger.debug('TemplateManagementPage - Total templates', 'templates', {
      count: templates.length,
    });
    logger.debug('Templates by show type', 'templates', {
      byTrialType: templates.reduce(
        (acc, t) => {
          const type = String(t.trialType);
          acc[type] = (acc[type] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      ),
    });
  }, [templates]);

  return (
    <div className="apple-template-page">
      <div className="apple-template-container">
        {/* Header */}
        <div className="apple-template-header">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="apple-template-title">Template Management</h1>
              <p className="apple-template-subtitle">
                Create and manage class templates for different organizations and show types
              </p>
            </div>
            <div className="flex gap-2">
              {/* Save button temporarily removed */}
              <Button
                onClick={() => {
                  logger.info('Force initializing templates', 'templates');
                  initializeDefaultTemplates(true);
                }}
                variant="outline"
                className="text-xs"
              >
                Force Initialize
              </Button>
              <Button
                onClick={() => setShowResetDialog(true)}
                variant="destructive"
                className="text-xs"
              >
                Reset Templates
              </Button>
              <Button
                onClick={() => {
                  const removed = cleanupDuplicateTemplates();
                  logger.info('Cleaned up duplicate templates', 'templates', { removed });
                }}
                variant="outline"
                className="text-xs"
              >
                Clean Duplicates
              </Button>
              <Button onClick={handleCreateNew} className="apple-button-primary">
                <Plus className="h-4 w-4" />
                Create Template
              </Button>
            </div>
          </div>
        </div>
        {/* Error Display */}
        {error && (
          <Card className="border-red-200 bg-red-50 mb-6">
            <CardContent className="pt-4">
              <div className="flex justify-between items-center">
                <p className="text-red-800">{error}</p>
                <Button variant="ghost" size="sm" onClick={clearError}>
                  Dismiss
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats Section */}
        <div className="apple-stats-section">
          <div className="apple-stats-grid">
            <div className="apple-stat-card">
              <div className="apple-stat-title">Total Templates</div>
              <div className="apple-stat-number">{totalCount}</div>
              <div className="apple-stat-description">Active templates</div>
            </div>

            <div className="apple-stat-card">
              <div className="apple-stat-title">Official</div>
              <div className="apple-stat-number">{officialCount}</div>
              <div className="apple-stat-description">Official templates</div>
            </div>

            <div className="apple-stat-card">
              <div className="apple-stat-title">Custom</div>
              <div className="apple-stat-number">{customCount}</div>
              <div className="apple-stat-description">Custom templates</div>
            </div>

            <div className="apple-stat-card">
              <div className="apple-stat-title">Inactive</div>
              <div className="apple-stat-number">{templates.length - totalCount}</div>
              <div className="apple-stat-description">Inactive templates</div>
            </div>
          </div>
        </div>

        {/* Filters Section */}
        <div className="apple-filter-section">
          <h2 className="apple-filter-title">
            <Filter className="h-5 w-5" />
            Filter Templates
          </h2>
          <div className="apple-filter-grid">
            {/* Search */}
            <Input
              placeholder="Search templates..."
              value={filter.searchTerm}
              onChange={e => handleFilterChange('searchTerm', e.target.value)}
              className="apple-filter-input"
            />

            {/* Organization */}
            <Select
              value={filter.organization}
              onValueChange={value => handleFilterChange('organization', value as Organization)}
            >
              <SelectTrigger className="apple-filter-input">
                <SelectValue placeholder="Organization" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Organizations</SelectItem>
                {organizations.map(org => (
                  <SelectItem key={org} value={org}>
                    {org}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Show Type */}
            <Select
              value={filter.trialType}
              onValueChange={value => handleFilterChange('trialType', value as TrialType)}
            >
              <SelectTrigger className="apple-filter-input">
                <SelectValue placeholder="Show Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Show Types</SelectItem>
                {trialTypes.map(type => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Template Type */}
            <Select
              value={filter.isOfficial === undefined ? 'all' : filter.isOfficial ? 'true' : 'false'}
              onValueChange={value =>
                handleFilterChange('isOfficial', value === 'all' ? undefined : value === 'true')
              }
            >
              <SelectTrigger className="apple-filter-input">
                <SelectValue placeholder="Template Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="true">Official Only</SelectItem>
                <SelectItem value="false">Custom Only</SelectItem>
              </SelectContent>
            </Select>

            {/* Active Status */}
            <Select
              value={filter.isActive === undefined ? 'all' : filter.isActive ? 'true' : 'false'}
              onValueChange={value =>
                handleFilterChange('isActive', value === 'all' ? undefined : value === 'true')
              }
            >
              <SelectTrigger className="apple-filter-input">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="true">Active Only</SelectItem>
                <SelectItem value="false">Inactive Only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Active Filters */}
          {(filter.searchTerm ||
            filter.organization ||
            filter.trialType ||
            filter.isActive !== undefined ||
            filter.isOfficial !== undefined) && (
            <div className="flex gap-2 mt-4 flex-wrap">
              <span className="text-sm text-muted-foreground">Active filters:</span>
              {filter.searchTerm && (
                <Badge variant="secondary" className="flex items-center gap-1">
                  Search: "{filter.searchTerm}"
                  <button
                    onClick={() => handleFilterChange('searchTerm', '')}
                    className="ml-1 hover:bg-red-100 rounded-full"
                  >
                    ×
                  </button>
                </Badge>
              )}
              {filter.organization && (
                <Badge variant="secondary" className="flex items-center gap-1">
                  Org: {filter.organization}
                  <button
                    onClick={() => handleFilterChange('organization', undefined)}
                    className="ml-1 hover:bg-red-100 rounded-full"
                  >
                    ×
                  </button>
                </Badge>
              )}
              {filter.trialType && (
                <Badge variant="secondary" className="flex items-center gap-1">
                  Type: {filter.trialType}
                  <button
                    onClick={() => handleFilterChange('trialType', undefined)}
                    className="ml-1 hover:bg-red-100 rounded-full"
                  >
                    ×
                  </button>
                </Badge>
              )}
              {filter.isActive !== undefined && (
                <Badge variant="secondary" className="flex items-center gap-1">
                  Status: {filter.isActive ? 'Active' : 'Inactive'}
                  <button
                    onClick={() => handleFilterChange('isActive', undefined)}
                    className="ml-1 hover:bg-red-100 rounded-full"
                  >
                    ×
                  </button>
                </Badge>
              )}
              {filter.isOfficial !== undefined && (
                <Badge variant="secondary" className="flex items-center gap-1">
                  {filter.isOfficial ? 'Official' : 'Custom'}
                  <button
                    onClick={() => handleFilterChange('isOfficial', undefined)}
                    className="ml-1 hover:bg-red-100 rounded-full"
                  >
                    ×
                  </button>
                </Badge>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFilter({ searchTerm: '' })}
                className="text-xs"
              >
                Clear All
              </Button>
            </div>
          )}
        </div>

        {/* Template List */}
        <div className="apple-templates-section">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
              <p className="mt-4 text-muted-foreground">Loading templates...</p>
            </div>
          ) : (
            <div className="apple-templates-grid">
              {filteredTemplates.map(template => (
                <div key={template.id} className="apple-template-card">
                  <div className="apple-template-card-header">
                    <div className="apple-template-card-icon">
                      <FileText className="h-6 w-6" />
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem onClick={() => handleEditTemplate(template.id)}>
                          <Edit className="mr-2 h-4 w-4" />
                          Edit Template
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleTestTemplate(template.id)}>
                          <TestTube className="mr-2 h-4 w-4" />
                          Test Template
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem>
                          <Copy className="mr-2 h-4 w-4" />
                          Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Download className="mr-2 h-4 w-4" />
                          Export
                        </DropdownMenuItem>
                        {!template.isOfficial && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem asChild>
                              <button
                                className="flex w-full items-center px-2 py-1.5 text-sm text-red-600 hover:bg-accent hover:text-red-600 cursor-pointer"
                                onClick={() => {
                                  logger.debug('Delete button clicked', 'templates', {
                                    templateId: template.id,
                                    templateName: template.templateName,
                                  });
                                  handleDeleteTemplate(template.id);
                                }}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </button>
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="apple-template-card-content">
                    <h3 className="apple-template-card-title">{template.templateName}</h3>
                    <p className="apple-template-card-organization">{template.organization}</p>
                    <p className="apple-template-card-showtype">
                      {template.trialType.replace('_', ' ')}
                    </p>

                    <div className="apple-template-card-meta">
                      <span className="apple-template-card-version">v{template.version}</span>
                      <span className="apple-template-card-date">
                        {template.updatedAt
                          ? new Date(template.updatedAt).toLocaleDateString()
                          : 'No date'}
                      </span>
                    </div>

                    <div className="apple-template-card-badges">
                      <span
                        className={`apple-template-badge ${template.isActive ? 'active' : 'inactive'}`}
                      >
                        {template.isActive ? 'Active' : 'Inactive'}
                      </span>
                      <span
                        className={`apple-template-badge ${template.isOfficial ? 'official' : 'custom'}`}
                      >
                        {template.isOfficial ? 'Official' : 'Custom'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}

              {filteredTemplates.length === 0 && (
                <div className="apple-template-empty">
                  <div className="apple-template-empty-icon">📋</div>
                  <h3 className="apple-template-empty-title">No templates found</h3>
                  <p className="apple-template-empty-description">
                    Create your first template or adjust your filters to see existing templates.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Reset Templates Confirmation Dialog */}
      <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset All Templates</AlertDialogTitle>
            <AlertDialogDescription>
              This will clear ALL templates and reload defaults. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                await clearCorruptedData();
                setTimeout(() => initializeDefaultTemplates(true), 500);
                setShowResetDialog(false);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Reset All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialog.open}
        onOpenChange={open => setDeleteDialog(prev => ({ ...prev, open }))}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-500" />
              Delete Template
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deleteDialog.template?.templateName}"?
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">This action cannot be undone</h3>
                  <p className="mt-2 text-sm text-red-700">
                    This will permanently delete the template and all its configurations. Any shows
                    or classes using this template will not be affected.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setDeleteDialog({ open: false, template: null })}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialogs temporarily removed to fix import issues */}
    </div>
  );
};

export default TemplateManagementPage;
