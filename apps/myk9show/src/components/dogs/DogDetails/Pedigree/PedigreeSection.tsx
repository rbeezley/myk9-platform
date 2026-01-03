import { useState } from 'react';
import { ExtendedAncestor } from './PedigreeAncestorAddDialog';
import { mockPedigreeData } from '@/data/mockPedigreeData';
import PedigreeAncestorEditDialog from './PedigreeAncestorEditDialog';
import PedigreeAncestorDetailsDialog from './PedigreeAncestorDetailsDialog';
import DeleteAncestorDialog from './DeleteAncestorDialog';
import PedigreeTree from './PedigreeTree';

interface PedigreeSectionProps {
  pedigree?: ExtendedAncestor[];
  addAncestor?: (ancestor: Omit<ExtendedAncestor, 'id'>) => void;
  editAncestor?: (id: string, ancestor: ExtendedAncestor) => void;
  deleteAncestor?: (id: string) => void;
  header?: React.ReactNode;
}

export default function PedigreeSection({ pedigree = mockPedigreeData, editAncestor = () => {}, deleteAncestor = () => {}, header }: PedigreeSectionProps) {
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [editPedigreeObj, setEditPedigreeObj] = useState<ExtendedAncestor | null>(null);
  const [detailsPedigreeObj, setDetailsPedigreeObj] = useState<ExtendedAncestor | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletePedigreeObj, setDeletePedigreeObj] = useState<ExtendedAncestor | null>(null);

  return (
    <div className="bg-background rounded-xl shadow-sm p-6 border">
      {header && (
        <div className="flex items-center mb-4">{header}</div>
      )}
      {/* Pedigree visual layout */}
      <PedigreeTree
        ancestors={pedigree}
        onView={(ancestor) => {
          setDetailsPedigreeObj(ancestor ?? null);
          setDetailsDialogOpen(true);
        }}
        onEdit={(ancestor) => {
          setEditPedigreeObj(ancestor ?? null);
          setEditDialogOpen(true);
        }}
        onDelete={(ancestor) => {
          setDeletePedigreeObj(ancestor ?? null);
          setDeleteDialogOpen(true);
        }}
      />
      <PedigreeAncestorEditDialog
        open={editDialogOpen}
        ancestor={editPedigreeObj}
        onClose={() => setEditDialogOpen(false)}
        onSave={a => {
          if (a.id) editAncestor(String(a.id), a);
          setEditDialogOpen(false);
        }}
      />
      <PedigreeAncestorDetailsDialog
        open={detailsDialogOpen}
        ancestor={detailsPedigreeObj}
        onClose={() => setDetailsDialogOpen(false)}
      />
      <DeleteAncestorDialog
        open={deleteDialogOpen}
        ancestorName={deletePedigreeObj?.name}
        onClose={() => {
          setDeleteDialogOpen(false);
          setDeletePedigreeObj(null);
        }}
        onDelete={() => {
          if (deletePedigreeObj?.id) {
            deleteAncestor(String(deletePedigreeObj.id));
          }
          setDeleteDialogOpen(false);
          setDeletePedigreeObj(null);
        }}
      />
    </div>
  );
}

