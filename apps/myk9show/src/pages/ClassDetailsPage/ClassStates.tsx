/**
 * State Components for ClassDetailsPage
 *
 * Renders different UI states: not found, empty, loading
 */

import { startTransition } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Plus, ArrowLeft } from 'lucide-react';

/**
 * Shown when the requested class doesn't exist
 */
export function ClassNotFoundState() {
  const navigate = useNavigate();

  return (
    <div className="myk9-class-page flex items-center justify-center min-h-screen">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-foreground mb-4">Class Not Found</h1>
        <p className="text-muted-foreground mb-4">The class you're looking for doesn't exist.</p>
        <button
          onClick={() => {
            startTransition(() => {
              navigate('/classes');
            });
          }}
          className="myk9-action-button myk9-action-button-primary"
        >
          Back to Classes
        </button>
      </div>
    </div>
  );
}

/**
 * Shown when there are no classes in the system
 */
export function EmptyClassState() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen bg-background">
      <div className="w-80 border-r border-border bg-card">
        <div className="p-4">
          <div className="text-sm text-muted-foreground">No classes found</div>
        </div>
      </div>
      <main className="flex-1 overflow-auto">
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground mb-4">No Classes Available</h1>
            <p className="text-muted-foreground mb-6">
              Classes are created within trials. Start by creating a show and adding trials with
              classes.
            </p>
            <div className="flex gap-3 justify-center">
              <Button
                onClick={() => navigate('/shows')}
                variant="outline"
                className="flex items-center gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Go to Shows
              </Button>
              <Button
                onClick={() => navigate('/secretary/create-show/wizard')}
                className="flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                New Show
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

/**
 * Shown while class data is loading
 */
export function LoadingClassState() {
  return (
    <div className="flex min-h-screen bg-background">
      <div className="w-80 border-r border-border bg-card">
        <div className="p-4">
          <div className="text-sm text-muted-foreground">Loading classes...</div>
        </div>
      </div>
      <main className="flex-1 overflow-auto">
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <h1 className="text-xl font-medium text-foreground">Loading class details...</h1>
          </div>
        </div>
      </main>
    </div>
  );
}
