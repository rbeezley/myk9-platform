import React, { useState } from 'react';
import { ClassTemplate } from '@/types/template.types';
import { useTemplateStore } from '@/store/templateStore';
import { logger } from '@/services/LoggingService';
import { Button } from '@/components/ui/button';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
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
import { 
  Edit, 
  MoreVertical, 
  Copy, 
  Download, 
  Trash2, 
  TestTube, 
  Shield, 
  Calendar,
  Users,
  FileText
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useAuthContext } from '@/hooks/useAuthContext';
import '@/styles/myk9-template-management.css';

interface TemplateListProps {
  templates: ClassTemplate[];
  onEdit: (templateId: string) => void;
  onTest: (templateId: string) => void;
}

export const TemplateList: React.FC<TemplateListProps> = ({
  templates,
  onEdit,
  onTest
}) => {
  const { user } = useAuthContext();
  const { duplicateTemplate, exportTemplate, deleteTemplate } = useTemplateStore();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<ClassTemplate | null>(null);

  const handleDelete = (template: ClassTemplate) => {
    if (template.isOfficial) {
      return; // Can't delete official templates
    }
    setTemplateToDelete(template);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (templateToDelete) {
      try {
        deleteTemplate(templateToDelete.id);
        setDeleteDialogOpen(false);
        setTemplateToDelete(null);
      } catch (error) {
        logger.error('Failed to delete template:', 'components', {}, error as Error);
      }
    }
  };

  const handleDuplicate = (template: ClassTemplate) => {
    const newName = `${template.templateName} (Copy)`;
    const duplicated = duplicateTemplate(template.id, newName, user?.id || 'unknown');
    if (duplicated) {
      onEdit(duplicated.id);
    }
  };

  const handleExport = (template: ClassTemplate) => {
    const exportData = exportTemplate(template.id, user?.id || 'unknown');
    if (exportData) {
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${template.templateName.replace(/[^a-z0-9]/gi, '_')}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  if (templates.length === 0) {
    return (
      <div className="myk9-empty-state">
        <FileText className="myk9-empty-icon" />
        <h3 className="myk9-empty-title">No templates found</h3>
        <p className="myk9-empty-description">
          No templates match your current filters. Try adjusting your search criteria or create a new template.
        </p>
        <Button onClick={() => window.location.href = '/admin/templates/new'} className="myk9-button-primary">
          Create Your First Template
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="myk9-templates-grid">
        {templates.map((template) => (
          <div key={template.id} className={`myk9-template-card ${template.isOfficial ? 'myk9-template-card-official' : ''} ${!template.isActive ? 'myk9-template-card-inactive' : ''}`}>
          <div className="myk9-template-card-header">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <h3 className="myk9-template-card-title">
                  {template.templateName}
                </h3>
                <div className="myk9-template-badges">
                  <span className={template.isOfficial ? "myk9-badge myk9-badge-official" : "myk9-badge myk9-badge-custom"}>
                    {template.isOfficial ? (
                      <span className="flex items-center gap-1">
                        <Shield className="w-3 h-3" />
                        Official
                      </span>
                    ) : (
                      'Custom'
                    )}
                  </span>
                  {!template.isActive && (
                    <span className="myk9-badge myk9-badge-inactive">
                      Inactive
                    </span>
                  )}
                  <span className="myk9-badge myk9-badge-outline">
                    {String(template.organization)}
                  </span>
                  <span className="myk9-badge myk9-badge-outline">
                    {String(template.trialType)}
                  </span>
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild nativeButton>
                  <Button variant="ghost" size="sm" className="myk9-action-menu myk9-menu-button">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onEdit(template.id)}>
                      <Edit className="mr-2 h-4 w-4" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onTest(template.id)}>
                      <TestTube className="mr-2 h-4 w-4" />
                      Test
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => handleDuplicate(template)}>
                      <Copy className="mr-2 h-4 w-4" />
                      Duplicate
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleExport(template)}>
                      <Download className="mr-2 h-4 w-4" />
                      Export
                    </DropdownMenuItem>
                    {!template.isOfficial && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          onClick={() => handleDelete(template)}
                          className="text-red-600"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
          </div>
          
          <div className="myk9-template-card-content">
            {template.description && (
              <p className="myk9-template-description">
                {template.description}
              </p>
            )}
            
            <div className="myk9-template-metadata">
              <div className="myk9-metadata-item">
                <Users className="h-4 w-4" />
                <span>{template.classDefinitions.length} classes</span>
              </div>
              <div className="myk9-metadata-item">
                <FileText className="h-4 w-4" />
                <span>v{template.version}</span>
              </div>
            </div>

            {template.officialRulesReference && (
              <div className="template-rules-ref">
                <strong>Rules:</strong> {template.officialRulesReference}
              </div>
            )}

            <div className="myk9-template-divider"></div>

            <div className="myk9-template-timestamp">
              <Calendar className="h-3 w-3" />
              <span>
                Updated {formatDistanceToNow(new Date(template.updatedAt || template.createdAt || new Date()), { addSuffix: true })}
              </span>
            </div>
          </div>
        </div>
        ))}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{templateToDelete?.templateName}"? 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
