import React from 'react';
import { ClassTemplate, ClassDefinition } from '@/types/template.types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FileText, Clock, CheckCircle, AlertCircle, User } from 'lucide-react';

// --- Template Selection Step ---

export interface TemplateSelectionStepProps {
  availableTemplates: ClassTemplate[];
  activeTemplates: ClassTemplate[];
  selectedTemplateId: string;
  selectedTemplate: ClassTemplate | null;
  trialOrganization?: string | undefined;
  onSelectTemplate: (id: string) => void;
}

function getTemplateDisplayValue(value: unknown): string {
  if (typeof value === 'object' && value !== null) {
    return String(Object.values(value)[0] || 'Unknown');
  }
  return String(value || 'Unknown');
}

export const TemplateSelectionStep: React.FC<TemplateSelectionStepProps> = ({
  availableTemplates,
  activeTemplates,
  selectedTemplateId,
  selectedTemplate,
  trialOrganization,
  onSelectTemplate,
}) => {
  if (availableTemplates.length === 0) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          No templates are available. Please wait for templates to load or create a template first.
        </AlertDescription>
      </Alert>
    );
  }

  if (activeTemplates.length === 0) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          {trialOrganization
            ? `No active templates found for "${trialOrganization}" organization. Please create a template for this organization or ensure your templates are activated.`
            : 'No active templates are available. Please create a template first or ensure your templates are activated.'}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">Available Templates</label>
          <Select value={selectedTemplateId} onValueChange={onSelectTemplate}>
            <SelectTrigger>
              <SelectValue placeholder="Select a template" />
            </SelectTrigger>
            <SelectContent>
              {activeTemplates.map(template => {
                const orgValue = getTemplateDisplayValue(template.organization);
                const showTypeValue = getTemplateDisplayValue(template.trialType);
                const templateName = template.templateName || 'Unnamed Template';

                return (
                  <SelectItem key={template.id} value={template.id}>
                    {templateName} ({orgValue} - {showTypeValue})
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      </div>

      {selectedTemplate && (
        <div className="myk9-template-card">
          <div className="myk9-template-header">
            <div className="myk9-template-title-section">
              <FileText className="myk9-template-icon" />
              <h3 className="myk9-template-title">
                {selectedTemplate.templateName || 'Unnamed Template'}
              </h3>
            </div>
          </div>

          <div className="myk9-template-content">
            <div className="myk9-template-details">
              <div className="myk9-template-detail-item">
                <span className="myk9-template-label">Organization:</span>
                <span className="myk9-template-value">
                  {getTemplateDisplayValue(selectedTemplate.organization)}
                </span>
              </div>
              <div className="myk9-template-detail-item">
                <span className="myk9-template-label">Show Type:</span>
                <span className="myk9-template-value">
                  {getTemplateDisplayValue(selectedTemplate.trialType)}
                </span>
              </div>
              <div className="myk9-template-detail-item">
                <span className="myk9-template-label">Version:</span>
                <span className="myk9-template-value">{selectedTemplate.version || 'N/A'}</span>
              </div>
              <div className="myk9-template-detail-item">
                <span className="myk9-template-label">Classes Available:</span>
                <span className="myk9-template-value">
                  {selectedTemplate.classDefinitions?.length || 0} classes
                </span>
              </div>
            </div>

            {selectedTemplate.description && (
              <div className="myk9-template-description">
                <span className="myk9-template-description-label">Description:</span>
                <p className="myk9-template-description-text">{selectedTemplate.description}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// --- Confirmation Step ---

export interface ConfirmationStepProps {
  selectedTemplate: ClassTemplate;
  selectedClasses: ClassDefinition[];
  judgeAssignments: Record<string, string>;
  availableJudges: { judgeId: string; judgeName: string }[];
}

export const ConfirmationStep: React.FC<ConfirmationStepProps> = ({
  selectedTemplate,
  selectedClasses,
  judgeAssignments,
  availableJudges,
}) => {
  const estimatedTime =
    selectedClasses.length * (selectedTemplate.defaults?.judgingTimeEstimate || 15);

  const classesByElement = selectedClasses.reduce(
    (acc, cls) => {
      if (!acc[cls.element]) acc[cls.element] = [];
      acc[cls.element].push(cls);
      return acc;
    },
    {} as Record<string, ClassDefinition[]>
  );

  return (
    <div className="myk9-confirmation-container">
      {/* Summary Cards */}
      <div className="myk9-confirmation-summary">
        <div className="myk9-summary-card">
          <div className="myk9-summary-icon myk9-summary-icon-classes">
            <CheckCircle className="h-6 w-6" />
          </div>
          <div className="myk9-summary-content">
            <div className="myk9-summary-number">{selectedClasses.length}</div>
            <div className="myk9-summary-label">Classes Selected</div>
          </div>
        </div>

        <div className="myk9-summary-card">
          <div className="myk9-summary-icon myk9-summary-icon-time">
            <Clock className="h-6 w-6" />
          </div>
          <div className="myk9-summary-content">
            <div className="myk9-summary-number">{estimatedTime} min</div>
            <div className="myk9-summary-label">Est. Judging Time</div>
            <div className="myk9-summary-note">Setup time not included</div>
          </div>
        </div>

        <div className="myk9-summary-card">
          <div className="myk9-summary-icon myk9-summary-icon-template">
            <FileText className="h-6 w-6" />
          </div>
          <div className="myk9-summary-content">
            <div className="myk9-summary-text">{selectedTemplate.templateName}</div>
            <div className="myk9-summary-label">Template Used</div>
          </div>
        </div>
      </div>

      {/* Selected Classes */}
      <div className="myk9-confirmation-classes">
        <div className="myk9-confirmation-header">
          <h3 className="myk9-confirmation-title">Selected Classes</h3>
          <div className="myk9-confirmation-subtitle">
            Review your selection before adding to the trial
          </div>
        </div>

        <div className="myk9-classes-by-element">
          {Object.entries(classesByElement).map(([element, classes]) => (
            <div key={element} className="myk9-element-group">
              <div className="myk9-element-header">
                <div className="myk9-element-badge">{element}</div>
                <div className="myk9-element-count">
                  {classes.length} class{classes.length !== 1 ? 'es' : ''}
                </div>
              </div>

              <div className="myk9-classes-grid">
                {classes.map((cls, index) => {
                  const judgeId = judgeAssignments[cls.className];
                  const judge = judgeId ? availableJudges.find(j => j.judgeId === judgeId) : null;
                  const judgeName = judge?.judgeName;

                  return (
                    <div key={index} className="myk9-class-item">
                      <div className="myk9-class-check">
                        <CheckCircle className="h-4 w-4" />
                      </div>
                      <div className="myk9-class-info">
                        <div className="myk9-class-name">
                          {cls.level || element}
                          {cls.section && <span className="myk9-class-section">{cls.section}</span>}
                        </div>
                        {judgeName && (
                          <div className="myk9-class-judge">
                            <User className="h-3 w-3" />
                            <span>{judgeName}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
