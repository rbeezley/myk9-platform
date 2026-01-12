import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, User, Gavel, FileText, TestTube } from 'lucide-react';
import { usePanelManager } from './hooks';
import { logger } from '@/services/LoggingService';

export const PanelTestComponent: React.FC = () => {
  const panelManager = usePanelManager();

  const handleTestClubPanel = () => {
    panelManager.openPanel({
      type: 'club',
      title: 'Test Club Creation',
      subtitle: 'Create a new club for testing',
      context: {
        entityType: 'club',
        mode: 'create',
        selectionCallback: (club) => {
          logger.debug('✅ Test: Club created successfully:', 'panels', { data: club });
          alert(`Club "${club.name}" created successfully!`);
        },
      },
      size: 'lg',
    });
  };

  const handleTestPersonPanel = () => {
    panelManager.openPanel({
      type: 'person',
      title: 'Test User Creation',
      subtitle: 'Add a new person for testing',
      context: {
        entityType: 'person',
        mode: 'create',
        selectionCallback: (person) => {
          logger.debug('✅ Test: User created successfully:', 'panels', { data: person });
          alert(`User "${person.firstName} ${person.lastName}" created successfully!`);
        },
      },
      size: 'lg',
    });
  };

  const handleTestJudgePanel = () => {
    panelManager.openPanel({
      type: 'judge',
      title: 'Test Judge Creation',
      subtitle: 'Add a new judge for testing',
      context: {
        entityType: 'judge',
        mode: 'create',
        selectionCallback: (judge) => {
          logger.debug('✅ Test: Judge created successfully:', 'panels', { data: judge });
          alert(`Judge "${judge.name}" created successfully!`);
        },
      },
      size: 'lg',
    });
  };

  const handleTestTemplatePanel = () => {
    panelManager.openPanel({
      type: 'template',
      title: 'Test Template Creation',
      subtitle: 'Create a custom template for testing',
      context: {
        entityType: 'template',
        mode: 'create',
        selectionCallback: (template) => {
          logger.debug('✅ Test: Template created successfully:', 'panels', { data: template });
          alert(`Template "${template.name}" created successfully!`);
        },
      },
      size: 'xl',
    });
  };

  const handleTestNestedPanels = () => {
    // Open first panel
    const firstPanelId = panelManager.openPanel({
      type: 'club',
      title: 'Parent Panel - Club',
      subtitle: 'This will open a child panel',
      context: {
        entityType: 'club',
        mode: 'create',
      },
      size: 'lg',
    });

    // Wait a moment then open child panel
    setTimeout(() => {
      panelManager.openPanel({
        type: 'person',
        title: 'Child Panel - User',
        subtitle: 'This is a nested panel',
        context: {
          entityType: 'person',
          mode: 'create',
        },
        parentId: firstPanelId,
        size: 'md',
      });
    }, 1000);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <TestTube className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">Panel System Testing</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Test all panel functionality and features
        </p>
      </div>

      {/* Single Panel Tests */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Individual Panel Tests</CardTitle>
          <CardDescription>
            Test each entity creation panel individually
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            onClick={handleTestClubPanel}
            className="w-full justify-start gap-3"
            variant="outline"
          >
            <Building2 className="h-4 w-4" />
            Test Club Creation Panel
          </Button>
          
          <Button
            onClick={handleTestPersonPanel}
            className="w-full justify-start gap-3"
            variant="outline"
          >
            <User className="h-4 w-4" />
            Test User Creation Panel
          </Button>
          
          <Button
            onClick={handleTestJudgePanel}
            className="w-full justify-start gap-3"
            variant="outline"
          >
            <Gavel className="h-4 w-4" />
            Test Judge Creation Panel
          </Button>
          
          <Button
            onClick={handleTestTemplatePanel}
            className="w-full justify-start gap-3"
            variant="outline"
          >
            <FileText className="h-4 w-4" />
            Test Template Creation Panel
          </Button>
        </CardContent>
      </Card>

      {/* Advanced Panel Tests */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Advanced Features</CardTitle>
          <CardDescription>
            Test panel stacking, navigation, and complex scenarios
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            onClick={handleTestNestedPanels}
            className="w-full justify-start gap-3"
            variant="outline"
          >
            Nested Panels Test (Parent → Child)
          </Button>
          
          <Button
            onClick={() => panelManager.debug()}
            className="w-full justify-start gap-3"
            variant="outline"
          >
            Debug Panel State (Check Console)
          </Button>
          
          <Button
            onClick={() => panelManager.closeAllPanels()}
            className="w-full justify-start gap-3"
            variant="destructive"
          >
            Close All Panels
          </Button>
        </CardContent>
      </Card>

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Testing Instructions</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>1. <strong>Single Panel Tests:</strong> Click any entity button to test individual panel creation</p>
          <p>2. <strong>Club Panel:</strong> Fill out the form and click "Save & Close" - should show success feedback</p>
          <p>3. <strong>Nested Panels:</strong> Test panel stacking with parent/child relationships</p>
          <p>4. <strong>Navigation:</strong> Use back buttons and escape key to test navigation</p>
          <p>5. <strong>Responsive:</strong> Resize window to test mobile/desktop behavior</p>
          <p>6. <strong>Debug:</strong> Check browser console for detailed logging</p>
        </CardContent>
      </Card>
    </div>
  );
};