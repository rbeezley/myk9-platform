import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTemplateStore } from '@/store/templateStore';
import { useClassCreationStore } from '@/store/classCreationStore';
import { useAuthContext } from '@/hooks/useAuthContext';
import { ClassTemplate, CreatedClass } from '@/types/template.types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  ArrowLeft, 
  Play, 
  CheckCircle, 
  AlertTriangle, 
  Download,
  RefreshCw,
  TestTube,
  FileText
} from 'lucide-react';

export const TemplateTestingPage: React.FC = () => {
  const { templateId } = useParams<{ templateId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const { getTemplate } = useTemplateStore();
  const { 
    selectTemplate, 
    selectAllClasses, 
    createClasses, 
    validateSelections,
    resetCreation 
  } = useClassCreationStore();
  
  const [template, setTemplate] = useState<ClassTemplate | null>(null);
  const [testResults, setTestResults] = useState<{
    classes: CreatedClass[];
    validationPassed: boolean;
    errors: string[];
    executionTime: number;
  } | null>(null);
  const [testing, setTesting] = useState(false);

  // Load template on mount
  useEffect(() => {
    if (templateId) {
      const existingTemplate = getTemplate(templateId);
      if (existingTemplate) {
        setTemplate(existingTemplate);
      } else {
        navigate('/admin/templates');
      }
    }
  }, [templateId, getTemplate, navigate]);

  const runTest = async () => {
    if (!template) return;
    
    setTesting(true);
    const startTime = Date.now();
    
    try {
      // Reset any previous state
      resetCreation();
      
      // Select the template
      selectTemplate(template.id);
      
      // Select all classes for testing
      selectAllClasses();
      
      // Validate selections
      const validationPassed = validateSelections();
      
      // Create test classes
      const mockTrialId = 'test-trial-' + Date.now();
      const creationResult = createClasses(mockTrialId, user?.id || 'unknown');
      
      const executionTime = Date.now() - startTime;
      
      setTestResults({
        classes: creationResult.classes,
        validationPassed: validationPassed && creationResult.success,
        errors: creationResult.success ? [] : creationResult.errors,
        executionTime
      });
      
    } catch (error) {
      const executionTime = Date.now() - startTime;
      setTestResults({
        classes: [],
        validationPassed: false,
        errors: [error instanceof Error ? error.message : 'Unknown error occurred'],
        executionTime
      });
    } finally {
      setTesting(false);
    }
  };

  const exportResults = () => {
    if (!testResults || !template) return;
    
    const exportData = {
      template: {
        id: template.id,
        name: template.templateName,
        organization: template.organization,
        showType: template.showType,
        version: template.version
      },
      testResults: {
        timestamp: new Date().toISOString(),
        validationPassed: testResults.validationPassed,
        classesGenerated: testResults.classes.length,
        errors: testResults.errors,
        executionTime: testResults.executionTime,
        classes: testResults.classes.map(cls => ({
          className: cls.className,
          element: cls.element,
          level: cls.level,
          section: cls.section,
          fieldValues: cls.fieldValues
        }))
      }
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `template_test_${template.templateName.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleBack = () => {
    navigate('/admin/templates');
  };

  if (!template) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading template...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-6xl pt-20">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={handleBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Templates
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <div>
            <h1 className="text-2xl font-bold">Test Template</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-muted-foreground">{template.templateName}</span>
              <Badge variant={template.isOfficial ? "default" : "secondary"}>
                {template.isOfficial ? 'Official' : 'Custom'}
              </Badge>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          {testResults && (
            <Button variant="outline" onClick={exportResults}>
              <Download className="h-4 w-4 mr-2" />
              Export Results
            </Button>
          )}
          <Button onClick={runTest} disabled={testing}>
            {testing ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            {testing ? 'Testing...' : 'Run Test'}
          </Button>
        </div>
      </div>

      {/* Template Summary */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TestTube className="h-5 w-5" />
            Template Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <h3 className="font-semibold mb-2">Basic Information</h3>
              <div className="space-y-1 text-sm">
                <div><strong>Organization:</strong> {template.organization}</div>
                <div><strong>Show Type:</strong> {template.showType}</div>
                <div><strong>Version:</strong> {template.version}</div>
                <div><strong>Status:</strong> {template.isActive ? 'Active' : 'Inactive'}</div>
              </div>
            </div>
            
            <div>
              <h3 className="font-semibold mb-2">Template Structure</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{template.classDefinitions.length}</div>
                  <div className="text-xs text-muted-foreground">Classes</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{template.fieldSpecifications.length}</div>
                  <div className="text-xs text-muted-foreground">Fields</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">{template.validationRules.length}</div>
                  <div className="text-xs text-muted-foreground">Rules</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600">
                    {template.fieldSpecifications.filter(f => f.required).length}
                  </div>
                  <div className="text-xs text-muted-foreground">Required</div>
                </div>
              </div>
            </div>

            <div>
              <h3 className="font-semibold mb-2">Default Settings</h3>
              <div className="space-y-1 text-sm">
                <div><strong>Entry Fee:</strong> ${template.defaults?.entryFees?.preEntry} / ${template.defaults?.entryFees?.dayOfShow}</div>
                <div><strong>Judging Time:</strong> {template.defaults?.judgingTimeEstimate} min</div>
                <div><strong>Min Age:</strong> {template.defaults?.minimumAge} months</div>
                <div><strong>Required Personnel:</strong> {template.defaults?.requiredPersonnel?.length || 0}</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Test Instructions */}
      {!testResults && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Testing Instructions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <p className="text-muted-foreground">
                This test will validate your template by:
              </p>
              <ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground ml-4">
                <li>Checking all field specifications for completeness</li>
                <li>Validating all class definitions</li>
                <li>Testing all validation rules</li>
                <li>Generating sample classes from the template</li>
                <li>Measuring performance and execution time</li>
              </ul>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <TestTube className="h-5 w-5 text-blue-600 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-blue-900">Ready to Test</h4>
                    <p className="text-sm text-blue-700 mt-1">
                      Click "Run Test" to start the validation process. This will create a mock trial with all classes from your template.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Test Results */}
      {testResults && (
        <div className="space-y-6">
          {/* Results Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {testResults.validationPassed ? (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                )}
                Test Results
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="text-center">
                  <div className={`text-2xl font-bold ${testResults.validationPassed ? 'text-green-600' : 'text-red-600'}`}>
                    {testResults.validationPassed ? 'PASS' : 'FAIL'}
                  </div>
                  <div className="text-sm text-muted-foreground">Validation</div>
                </div>
                
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{testResults.classes.length}</div>
                  <div className="text-sm text-muted-foreground">Classes Generated</div>
                </div>
                
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">{testResults.errors.length}</div>
                  <div className="text-sm text-muted-foreground">Errors</div>
                </div>
                
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600">{testResults.executionTime}ms</div>
                  <div className="text-sm text-muted-foreground">Execution Time</div>
                </div>
              </div>

              {testResults.errors.length > 0 && (
                <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <h4 className="font-medium text-red-900 mb-2">Errors Found:</h4>
                  <ul className="space-y-1">
                    {testResults.errors.map((error, index) => (
                      <li key={index} className="text-sm text-red-700 flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        {error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Generated Classes */}
          {testResults.classes.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Generated Classes ({testResults.classes.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {testResults.classes.map((cls) => (
                    <div key={cls.id} className="border rounded-lg p-3">
                      <div className="space-y-2">
                        <h4 className="font-medium text-sm">{cls.className}</h4>
                        <div className="flex flex-wrap gap-1">
                          <Badge variant="outline" className="text-xs">{cls.element}</Badge>
                          {cls.level && <Badge variant="secondary" className="text-xs">{cls.level}</Badge>}
                          {cls.section && <Badge variant="outline" className="text-xs">{cls.section}</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Run Order: {cls.runOrder} | Status: {cls.status}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {Object.keys(cls.fieldValues).length} field values
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
};