import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, FileText, Calendar } from 'lucide-react';

const CreateShowPage: React.FC = () => {
  const navigate = useNavigate();

  // Auto-redirect to wizard page when this page loads
  useEffect(() => {
    navigate('/secretary/create-show/wizard');
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-6 py-20 max-w-4xl">
        <div className="space-y-6">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">Create New Show</h1>
            <p className="text-muted-foreground text-lg">
              Create a new dog show with trials and classes using our step-by-step wizard
            </p>
          </div>
          
          {/* Create Show Options */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="cursor-pointer hover:shadow-md transition-shadow" 
                  onClick={() => navigate('/secretary/create-show/wizard')}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Plus className="h-5 w-5 text-primary" />
                  Create New Show
                </CardTitle>
                <CardDescription>
                  Start from scratch with our guided wizard to create a new dog show
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button className="w-full">
                  Start Wizard
                </Button>
              </CardContent>
            </Card>

            <Card className="cursor-pointer hover:shadow-md transition-shadow opacity-75">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  Use Template
                </CardTitle>
                <CardDescription>
                  Create a show based on existing templates (coming soon)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" className="w-full" disabled>
                  Browse Templates
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Quick Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button 
                variant="outline" 
                className="w-full justify-start"
                onClick={() => navigate('/browse-shows')}
              >
                Browse Existing Shows
              </Button>
              <Button 
                variant="outline" 
                className="w-full justify-start"
                onClick={() => navigate('/secretary/dashboard')}
              >
                Return to Secretary Dashboard
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Loading message while redirecting */}
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Redirecting to wizard...</p>
      </div>
    </div>
  );
};

export default CreateShowPage;