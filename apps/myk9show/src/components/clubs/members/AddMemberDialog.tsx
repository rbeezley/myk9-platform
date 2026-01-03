import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useUserStore } from '@/store/userStore';
import { useClubStore } from '@/store/clubStore';
import { Club } from '@/types/club-types';
import { Users } from 'lucide-react';

interface AddMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  club: Club;
}

export const AddMemberDialog: React.FC<AddMemberDialogProps> = ({
  open,
  onOpenChange,
  club
}) => {
  const [selectedPersonId, setSelectedPersonId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  
  const people = useUserStore(state => state.people);
  const updateClub = useClubStore(state => state.updateClub);

  // Filter out people who are already members
  const availablePeople = people.filter(person => 
    !club.memberIds?.includes(person.id.toString())
  );

  const handleAddMember = async () => {
    if (!selectedPersonId) return;

    setIsLoading(true);
    try {
      const updatedClub: Club = {
        ...club,
        memberIds: [...(club.memberIds || []), selectedPersonId]
      };
      
      await updateClub(updatedClub);
      
      // Reset form and close dialog
      setSelectedPersonId('');
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to add member:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setSelectedPersonId('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Add Member to {club.name}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {availablePeople.length === 0 ? (
            <div className="text-center py-8">
              <Users className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-60" />
              <div className="text-sm text-muted-foreground">
                No people available to add as members.
                {people.length === 0 ? (
                  <span className="block mt-1">Create some people first to add them as members.</span>
                ) : (
                  <span className="block mt-1">All existing people are already members.</span>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="person-select">Select User</Label>
              <Select value={selectedPersonId} onValueChange={setSelectedPersonId}>
                <SelectTrigger id="person-select">
                  <SelectValue placeholder="Choose a person to add as member" />
                </SelectTrigger>
                <SelectContent>
                  {availablePeople.map((person) => (
                    <SelectItem key={person.id} value={person.id.toString()}>
                      <div className="flex flex-col">
                        <div className="font-medium">
                          {person.firstName} {person.lastName}
                        </div>
                        {person.email && (
                          <div className="text-xs text-muted-foreground">
                            {person.email}
                          </div>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={isLoading}>
            Cancel
          </Button>
          <Button 
            onClick={handleAddMember} 
            disabled={!selectedPersonId || isLoading || availablePeople.length === 0}
          >
            {isLoading ? 'Adding...' : 'Add Member'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};