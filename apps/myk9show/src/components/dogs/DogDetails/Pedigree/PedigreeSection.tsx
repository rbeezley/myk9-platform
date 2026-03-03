import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuthContext } from '@/hooks/useAuthContext';
import {
  usePedigreeQuery,
  useUpsertPedigreeAncestorMutation,
  useUpdatePedigreeAncestorMutation,
  useDeletePedigreeAncestorMutation,
} from '@/hooks/queries/usePedigreeDatabase';
import type {
  PedigreeAncestor,
  PedigreePosition,
  CreatePedigreeAncestorData,
} from '@/types/pedigree-types';
import PedigreeTree from './PedigreeTree';
import PedigreeAncestorAddDialog from './PedigreeAncestorAddDialog';
import PedigreeAncestorEditDialog from './PedigreeAncestorEditDialog';
import PedigreeAncestorDetailsDialog from './PedigreeAncestorDetailsDialog';
import DeleteAncestorDialog from './DeleteAncestorDialog';

interface PedigreeSectionProps {
  dogId: string;
}

export default function PedigreeSection({ dogId }: PedigreeSectionProps) {
  const { user } = useAuthContext();
  const { data: ancestors = [], isLoading } = usePedigreeQuery(dogId);
  const upsertMutation = useUpsertPedigreeAncestorMutation();
  const updateMutation = useUpdatePedigreeAncestorMutation();
  const deleteMutation = useDeletePedigreeAncestorMutation();

  // Dialog state
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addPosition, setAddPosition] = useState<PedigreePosition | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editAncestor, setEditAncestor] = useState<PedigreeAncestor | null>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [detailsAncestor, setDetailsAncestor] = useState<PedigreeAncestor | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteAncestor, setDeleteAncestorObj] = useState<PedigreeAncestor | null>(null);

  const handleAdd = (position: PedigreePosition) => {
    setAddPosition(position);
    setAddDialogOpen(true);
  };

  const handleAddSave = (data: CreatePedigreeAncestorData) => {
    upsertMutation.mutate(data);
    setAddDialogOpen(false);
    setAddPosition(null);
  };

  const handleEdit = (ancestor: PedigreeAncestor) => {
    setEditAncestor(ancestor);
    setEditDialogOpen(true);
  };

  const handleEditSave = (ancestor: PedigreeAncestor) => {
    updateMutation.mutate({
      id: ancestor.id,
      dogId: ancestor.dog_id,
      updates: {
        registered_name: ancestor.registered_name,
        call_name: ancestor.call_name,
        titles: ancestor.titles,
        breed: ancestor.breed,
        color: ancestor.color,
        sex: ancestor.sex,
        date_of_birth: ancestor.date_of_birth,
        photo_url: ancestor.photo_url,
        registration_numbers: ancestor.registration_numbers,
        health_info: ancestor.health_info,
      },
    });
    setEditDialogOpen(false);
    setEditAncestor(null);
  };

  const handleView = (ancestor: PedigreeAncestor) => {
    setDetailsAncestor(ancestor);
    setDetailsDialogOpen(true);
  };

  const handleDeleteClick = (ancestor: PedigreeAncestor) => {
    setDeleteAncestorObj(ancestor);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (deleteAncestor) {
      deleteMutation.mutate({ id: deleteAncestor.id, dogId: deleteAncestor.dog_id });
    }
    setDeleteDialogOpen(false);
    setDeleteAncestorObj(null);
  };

  if (isLoading) {
    return (
      <div className="bg-background rounded-xl shadow-sm p-6 border flex items-center justify-center min-h-[200px]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="bg-background rounded-xl shadow-sm p-6 border">
      <div className="flex items-center mb-4">
        <h2 className="text-lg font-semibold">Pedigree</h2>
      </div>

      <PedigreeTree
        ancestors={ancestors}
        onAdd={handleAdd}
        onView={handleView}
        onEdit={handleEdit}
        onDelete={handleDeleteClick}
      />

      <PedigreeAncestorAddDialog
        open={addDialogOpen}
        position={addPosition}
        dogId={dogId}
        ownerId={user?.id || ''}
        onClose={() => {
          setAddDialogOpen(false);
          setAddPosition(null);
        }}
        onAdd={handleAddSave}
      />

      <PedigreeAncestorEditDialog
        open={editDialogOpen}
        ancestor={editAncestor}
        onClose={() => {
          setEditDialogOpen(false);
          setEditAncestor(null);
        }}
        onSave={handleEditSave}
      />

      <PedigreeAncestorDetailsDialog
        open={detailsDialogOpen}
        ancestor={detailsAncestor}
        onClose={() => setDetailsDialogOpen(false)}
      />

      <DeleteAncestorDialog
        open={deleteDialogOpen}
        ancestorName={deleteAncestor?.registered_name}
        onClose={() => {
          setDeleteDialogOpen(false);
          setDeleteAncestorObj(null);
        }}
        onDelete={handleDeleteConfirm}
        isSubmitting={deleteMutation.isPending}
      />
    </div>
  );
}
