import React from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ThreeDotMenu from '../common/ThreeDotMenu';
import type { User } from '@/types/dog-types';

interface PersonDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  person: User | null;
  onClose: () => void;
  onEdit?: (person: User) => void;
  onDelete?: (person: User) => void;
}

const PersonDetailsDialog: React.FC<PersonDetailsDialogProps> = ({ open, onOpenChange, person, onClose, onEdit, onDelete }) => {
  if (!person) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center justify-between">
            <span>{person.firstName} {person.lastName}</span>
            <ThreeDotMenu
              onEdit={onEdit ? () => { onClose(); onEdit(person); } : undefined}
              onDelete={onDelete ? () => { onClose(); onDelete(person); } : undefined}
            />
          </DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <div className="flex justify-center mb-6">
            <Avatar className="h-32 w-32">
              <AvatarImage src={person.profileImage} alt={`${person.firstName} ${person.lastName}`} className="object-cover" />
              <AvatarFallback>{person.firstName.charAt(0)}{person.lastName.charAt(0)}</AvatarFallback>
            </Avatar>
          </div>
          <Tabs defaultValue="info" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="info">Contact Information</TabsTrigger>
              <TabsTrigger value="dogs">Associated Dogs</TabsTrigger>
            </TabsList>
            <TabsContent value="info" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium text-gray-500">Email</h4>
                  <p className="text-base">{person.email}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-gray-500">Phone</h4>
                  <p className="text-base">{person.phone}</p>
                </div>
              </div>
              <div>
                <h4 className="text-sm font-medium text-gray-500">Address</h4>
                <p className="text-base">{person.streetAddress}</p>
                <p className="text-base">{person.city}, {person.state} {person.zipCode}</p>
              </div>
            </TabsContent>
            <TabsContent value="dogs" className="mt-4">
              {person.dogs && person.dogs.length > 0 ? (
                <div className="grid grid-cols-2 gap-4">
                  {person.dogs.map((dogId, index) => (
                    <Card key={dogId} className="min-w-[300px] bg-white dark:bg-gray-800 rounded-xl overflow-hidden shadow-lg hover:shadow-xl transition-all duration-300 border border-gray-200 dark:border-gray-700 snap-start flex-shrink-0 group">
                      <div className="p-4 flex items-center space-x-4">
                        <Avatar className="h-16 w-16">
                          <AvatarImage src="" alt={`Dog ${index + 1}`} />
                          <AvatarFallback>D</AvatarFallback>
                        </Avatar>
                        <div>
                          <h3 className="font-medium">Dog {index + 1}</h3>
                          <p className="text-sm text-gray-500">ID: {dogId}</p>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <i className="fas fa-dog text-4xl mb-2"></i>
                  <p>No dogs associated with this person</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
        <DialogFooter>
          <Button onClick={onClose} className="!rounded-button cursor-pointer whitespace-nowrap">Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PersonDetailsDialog;
