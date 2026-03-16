import { useState } from 'react';
import { UserEditPanel } from '@/components/panels/edit';
import { JudgeQualificationPanel } from '@/components/panels/edit';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { User as UserType } from '@/types/dog-types';
import type { JudgeQualification } from '@/types/judge-types';
import { logger } from '@/services/LoggingService';

// Mock user data for testing
const mockUser: Partial<UserType> = {
  id: 'test-user-1',
  firstName: 'John',
  lastName: 'Smith',
  email: 'john.smith@example.com',
  phone: '555-123-4567',
  streetAddress: '123 Main Street',
  city: 'Springfield',
  state: 'IL',
  zipCode: '62701',
  profileImage: '',
  judgeQualifications: [
    {
      id: 'qual-1',
      judgeNumber: 'AKC-12345',
      organization: 'AKC',
      showTypes: ['Conformation', 'Obedience', 'Rally'],
      certificationDate: '2020-01-15',
      status: 'Active',
      level: 'Senior',
      disciplines: ['Conformation', 'Obedience', 'Rally'],
      dateObtained: new Date('2020-01-15'),
      expirationDate: new Date('2025-01-15'),
    } as JudgeQualification,
    {
      id: 'qual-2',
      judgeNumber: 'UKC-67890',
      organization: 'UKC',
      showTypes: ['Agility', 'Herding'],
      certificationDate: '2019-06-20',
      status: 'Active',
      level: 'Apprentice',
      disciplines: ['Agility', 'Herding'],
      dateObtained: new Date('2019-06-20'),
      expirationDate: new Date('2024-06-20'),
    } as JudgeQualification,
  ] as JudgeQualification[],
  roles: undefined, // Roles would normally come from the database
};

export default function TestPanelPage() {
  const [isUserPanelOpen, setIsUserPanelOpen] = useState(false);
  const [isQualificationsPanelOpen, setIsQualificationsPanelOpen] = useState(false);
  const [userData, setUserData] = useState(mockUser);

  const handleUserSave = async (data: Partial<UserType>) => {
    logger.debug('Saving user data:', 'pages', { data: data });
    setUserData({ ...userData, ...data });
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 1000));
  };

  const handleQualificationsSaved = () => {
    logger.debug('Qualifications saved', 'pages');
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-3xl">🎯 Phase 2: SlideOverPanel Test Page</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-2">Test the New Panel Components</h3>
              <p className="text-muted-foreground mb-4">
                Click the buttons below to test the new SlideOverPanel implementations from Phase 1
                and Phase 2 of the migration plan.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Phase 2: UserEditPanel */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Phase 2: User Edit Panel</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Comprehensive user editing with tabbed interface, validation, and auto-save
                    capabilities.
                  </p>
                  <Button
                    onClick={() => setIsUserPanelOpen(true)}
                    className="w-full"
                    variant="default"
                  >
                    Open User Edit Panel
                  </Button>
                  <div className="text-xs space-y-1">
                    <p>✅ 3-tab interface (Basic, Contact, Qualifications)</p>
                    <p>✅ Form validation with error display</p>
                    <p>✅ Auto-save capabilities</p>
                    <p>✅ RBAC-based field visibility</p>
                  </div>
                </CardContent>
              </Card>

              {/* Phase 1: JudgeQualificationPanel */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Phase 1: Judge Qualifications Panel</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Spacious panel for managing judge qualifications with smart grouping.
                  </p>
                  <Button
                    onClick={() => setIsQualificationsPanelOpen(true)}
                    className="w-full"
                    variant="outline"
                  >
                    Open Qualifications Panel
                  </Button>
                  <div className="text-xs space-y-1">
                    <p>✅ Smart show type grouping</p>
                    <p>✅ Tag-based selection UI</p>
                    <p>✅ Mobile-responsive design</p>
                    <p>✅ RBAC integration</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Current User Data Display */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Current User Data (Updates on Save)</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="text-xs bg-muted p-3 rounded overflow-auto">
                  {JSON.stringify(userData, null, 2)}
                </pre>
              </CardContent>
            </Card>

            {/* Instructions */}
            <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg">
              <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
                Testing Instructions:
              </h4>
              <ol className="list-decimal list-inside space-y-1 text-sm text-blue-800 dark:text-blue-200">
                <li>Click "Open User Edit Panel" to test the new tabbed user editing experience</li>
                <li>Try switching between tabs (Basic Info, Contact, Qualifications)</li>
                <li>Edit some fields and notice the "Unsaved changes" indicator</li>
                <li>Try to close the panel with unsaved changes to see the warning</li>
                <li>Save changes and watch the data update in the preview below</li>
                <li>
                  Test the Judge Qualifications panel separately or from within the User Edit Panel
                </li>
                <li>On mobile, panels will appear full-screen for optimal UX</li>
              </ol>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Panels */}
      <UserEditPanel
        open={isUserPanelOpen}
        onClose={() => setIsUserPanelOpen(false)}
        userId={userData.id || 'test-user'}
        userName={`${userData.firstName} ${userData.lastName}`}
        initialUserData={userData}
        onSave={handleUserSave}
        enableAutoSave={false}
        showAdvancedFields={true}
      />

      <JudgeQualificationPanel
        open={isQualificationsPanelOpen}
        onClose={() => setIsQualificationsPanelOpen(false)}
        userId={userData.id || 'test-user'}
        userName={`${userData.firstName} ${userData.lastName}`}
        onSaved={handleQualificationsSaved}
      />
    </div>
  );
}
