import React, { useState, useMemo } from 'react';
import { User, UserCheck, Plus, Edit2, CheckCircle, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useDogStore } from '@/store/dogStore';
import { useUserStore } from '@/store/userStore';
import { ClassSelectionData, HandlerInfo } from '@/types/show-registration-types';
import { HandlerSelectionDialog } from './HandlerSelectionDialog';
import { logger } from '@/services/LoggingService';

interface HandlerAssignmentStepProps {
  selectedDogs: string[];
  classSelections: ClassSelectionData[];
  handlerAssignments: Record<string, HandlerInfo>;
  onHandlerAssignmentChange: (assignments: Record<string, HandlerInfo>) => void;
  showId: string;
}

export const HandlerAssignmentStep: React.FC<HandlerAssignmentStepProps> = ({
  selectedDogs,
  classSelections,
  handlerAssignments,
  onHandlerAssignmentChange,
  showId
}) => {
  const { dogs = [] } = useDogStore();
  const { people = [] } = useUserStore();
  const [showHandlerDialog, setShowHandlerDialog] = useState(false);
  
  // Get dogs with their information
  const dogsWithInfo = useMemo(() => {
    return selectedDogs.map(dogId => {
      const dog = dogs.find(d => d.id === dogId);
      if (!dog) return null;
      
      const owner = people.find(p => p.id === dog.ownerId);
      const handlerInfo = handlerAssignments[dogId];
      const dogClasses = classSelections.filter(c => c.dogId === dogId);
      
      return {
        dog,
        owner,
        handlerInfo,
        classCount: dogClasses.length,
        hasHandler: !!handlerInfo?.handlerId
      };
    }).filter((item): item is NonNullable<typeof item> => item !== null);
  }, [selectedDogs, dogs, people, handlerAssignments, classSelections]);
  
  // Calculate assignment statistics
  const stats = useMemo(() => {
    const totalDogs = selectedDogs.length;
    const assignedDogs = Object.keys(handlerAssignments).length;
    const ownerHandled = Object.values(handlerAssignments).filter(h => h.isOwner).length;
    const professionalHandled = assignedDogs - ownerHandled;
    
    return {
      totalDogs,
      assignedDogs,
      unassignedDogs: totalDogs - assignedDogs,
      ownerHandled,
      professionalHandled,
      isComplete: assignedDogs === totalDogs
    };
  }, [selectedDogs.length, handlerAssignments]);
  
  const handleSingleDogEdit = (dogId: string) => {
    // For individual dog edits, we could show a smaller dialog
    // For now, just show the full dialog with that dog pre-selected
    logger.debug('Single dog edit for:', 'shows', { data: dogId }); // TODO: implement specific dog editing
    setShowHandlerDialog(true);
  };
  
  return (
    <div className="space-y-6">
      {/* Statistics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{stats.totalDogs}</div>
            <p className="text-xs text-muted-foreground">Total Dogs</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">{stats.assignedDogs}</div>
            <p className="text-xs text-muted-foreground">Assigned</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{stats.ownerHandled}</div>
            <p className="text-xs text-muted-foreground">Owner Handled</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{stats.professionalHandled}</div>
            <p className="text-xs text-muted-foreground">Professional</p>
          </CardContent>
        </Card>
      </div>
      
      {/* Assignment Status */}
      {stats.isComplete ? (
        <Alert>
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>
            All dogs have been assigned handlers. You can proceed to the payment step.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {stats.unassignedDogs} dog(s) still need handler assignments.
          </AlertDescription>
        </Alert>
      )}
      
      {/* Bulk Actions */}
      <div className="flex flex-wrap gap-2">
        <Button 
          onClick={() => setShowHandlerDialog(true)}
          className="flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Assign Handlers
        </Button>
        {stats.assignedDogs > 0 && (
          <Button 
            variant="outline"
            onClick={() => setShowHandlerDialog(true)}
            className="flex items-center gap-2"
          >
            <Edit2 className="h-4 w-4" />
            Edit Assignments
          </Button>
        )}
      </div>
      
      {/* Dog Handler Assignments */}
      <Card>
        <CardHeader>
          <CardTitle>Handler Assignments</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px]">
            <div className="space-y-4">
              {dogsWithInfo.map(({ dog, owner, handlerInfo, classCount, hasHandler }) => (
                <div key={dog.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <div>
                        <h4 className="font-semibold">{dog.callName}</h4>
                        <p className="text-sm text-muted-foreground">
                          {dog.registrations?.[0]?.breed || 'No breed specified'} • {classCount} {classCount === 1 ? 'class' : 'classes'}
                        </p>
                        {owner && (
                          <p className="text-xs text-muted-foreground">
                            Owner: {owner.firstName} {owner.lastName}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    {hasHandler ? (
                      <div className="text-right">
                        <div className="flex items-center gap-2">
                          <UserCheck className="h-4 w-4 text-green-600" />
                          <span className="font-medium">{handlerInfo!.handlerName}</span>
                        </div>
                        <div className="flex items-center gap-1 mt-1">
                          <Badge variant={handlerInfo!.isOwner ? 'secondary' : 'outline'} className="text-xs">
                            {handlerInfo!.isOwner ? 'Owner' : 'Professional'}
                          </Badge>
                        </div>
                      </div>
                    ) : (
                      <div className="text-right">
                        <span className="text-sm text-muted-foreground">No handler assigned</span>
                        <Badge variant="outline" className="ml-2">Unassigned</Badge>
                      </div>
                    )}
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSingleDogEdit(dog.id)}
                      className="flex items-center gap-1"
                    >
                      <Edit2 className="h-3 w-3" />
                      {hasHandler ? 'Edit' : 'Assign'}
                    </Button>
                  </div>
                </div>
              ))}
              
              {dogsWithInfo.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <User className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No dogs selected for registration.</p>
                  <p className="text-sm">Go back to select dogs first.</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
      
      {/* Handler Selection Dialog */}
      <HandlerSelectionDialog
        open={showHandlerDialog}
        onOpenChange={setShowHandlerDialog}
        selectedDogs={selectedDogs}
        showId={showId}
        onHandlerAssignment={onHandlerAssignmentChange}
        initialAssignments={handlerAssignments}
      />
    </div>
  );
};