import React, { startTransition } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

// Test imports one by one
import { useTemplateStore } from '@/store/templateStore';

const TemplateEditorPageTest2: React.FC = () => {
  const { templateId } = useParams<{ templateId: string }>();
  const navigate = useNavigate();
  const { templates } = useTemplateStore();

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => startTransition(() => navigate('/admin/templates'))}
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

        <div className="border border-dashed border-muted-foreground/25 rounded-lg p-12 text-center">
          <div className="max-w-md mx-auto">
            <h2 className="text-xl font-semibold mb-4">Testing useTemplateStore Import</h2>
            <p className="text-muted-foreground mb-6">
              If you can see this, useTemplateStore import works. Found {templates.length} templates.
            </p>
            <Button onClick={() => startTransition(() => navigate('/admin/templates'))}>
              Return to Template Management
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TemplateEditorPageTest2;