import React, { useState } from 'react';
import { ClassTemplate } from '@/types/template.types';
import { useTemplateStore } from '@/store/templateStore';
import { 
  useDeleteClassTemplateMutation
} from '@/hooks/queries/useTemplatesDatabase';
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
import '@/styles/apple-template-management.css';

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
  const { duplicateTemplate, exportTemplate } = useTemplateStore();
  const deleteTemplateMutation = useDeleteClassTemplateMutation();
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
      deleteTemplateMutation.mutate(templateToDelete.id, {
        onSuccess: () => {
          setDeleteDialogOpen(false);
          setTemplateToDelete(null);
        },
        onError: (error) => {
          console.error('Failed to delete template:', error);
          // You could add toast notification here
        }
      });
    }
  };

  const handleDuplicate = (template: ClassTemplate) => {
    const newName = `${template.templateName} (Copy)`;
    const duplicated = duplicateTemplate(template.id, newName);
    if (duplicated) {
      onEdit(duplicated.id);
    }
  };

  const handleExport = (template: ClassTemplate) => {
    const exportData = exportTemplate(template.id);
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
      <div className="apple-empty-state">
        <FileText className="apple-empty-icon" />
        <h3 className="apple-empty-title">No templates found</h3>
        <p className="apple-empty-description">
          No templates match your current filters. Try adjusting your search criteria or create a new template.
        </p>
        <Button onClick={() => window.location.href = '/admin/templates/new'} className="apple-button-primary">
          Create Your First Template
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="apple-templates-grid">
        {templates.map((template) => (
          <div key={template.id} className={`apple-template-card ${template.isOfficial ? 'apple-template-card-official' : ''} ${!template.isActive ? 'apple-template-card-inactive' : ''}`}>
          <div className="apple-template-card-header">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <h3 className="apple-template-card-title">
                  {template.templateName}
                </h3>
                <div className="apple-template-badges">
                  <span className={template.isOfficial ? "apple-badge apple-badge-official" : "apple-badge apple-badge-custom"}>
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
                    <span className="apple-badge apple-badge-inactive">
                      Inactive
                    </span>
                  )}
                  <span className="apple-badge apple-badge-outline">
                    {String(template.organization)}
                  </span>
                  <span className="apple-badge apple-badge-outline">
                    {String(template.showType)}
                  </span>
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="apple-action-menu apple-menu-button">
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
          
          <div className="apple-template-card-content">
            {template.description && (
              <p className="apple-template-description">
                {template.description}
              </p>
            )}
            
            <div className="apple-template-metadata">
              <div className="apple-metadata-item">
                <Users className="h-4 w-4" />
                <span>{template.classDefinitions.length} classes</span>
              </div>
              <div className="apple-metadata-item">
                <FileText className="h-4 w-4" />
                <span>v{template.version}</span>
              </div>
            </div>

            {template.officialRulesReference && (
              <div className="template-rules-ref">
                <strong>Rules:</strong> {template.officialRulesReference}
              </div>
            )}

            <div className="apple-template-divider"></div>

            <div className="apple-template-timestamp">
              <Calendar className="h-3 w-3" />
              <span>
                Updated {formatDistanceToNow(new Date(template.updatedAt || Date.now()), { addSuffix: true })}
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