import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

const TemplateEditorPageSimple2: React.FC = () => {
  const { templateId } = useParams<{ templateId: string }>();
  const navigate = useNavigate();

  const handleGoBack = () => {
    navigate('/admin/templates');
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button 
            variant="ghost" 
            size="sm"
            onClick={handleGoBack}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Templates
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Template Editor</h1>
            <p className="text-muted-foreground">Template ID: {templateId}</p>
          </div>
        </div>

        {/* Placeholder Content */}
        <div className="border border-dashed border-muted-foreground/25 rounded-lg p-12 text-center">
          <div className="max-w-md mx-auto">
            <h2 className="text-xl font-semibold mb-4">Template Editor Coming Soon</h2>
            <p className="text-muted-foreground mb-6">
              The template editor is currently being developed. This will allow you to create and modify 
              class templates with custom fields, rules, and configurations.
            </p>
            <Button onClick={handleGoBack}>
              Return to Template Management
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TemplateEditorPageSimple2;