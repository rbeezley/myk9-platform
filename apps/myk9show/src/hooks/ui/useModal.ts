import { useState, useCallback } from 'react';

/**
 * Return type for the useModal hook.
 */
interface UseModalReturn {
  /** Current open state of the modal */
  isOpen: boolean;
  /** Function to open the modal */
  open: () => void;
  /** Function to close the modal and clear data */
  close: () => void;
  /** Function to toggle modal state */
  toggle: () => void;
  /** Current data associated with the modal */
  data: unknown;
  /** Function to set modal data */
  setData: (data: unknown) => void;
  /** Function to open modal with specific data */
  openWithData: (data: unknown) => void;
}

/**
 * Hook for managing modal state with data passing capabilities.
 * Provides a simple interface for opening, closing, and passing data to modals.
 * 
 * @param defaultOpen - Whether the modal should be open by default
 * @returns Object with modal state and control functions
 * 
 * @example
 * ```typescript
 * function MyComponent() {
 *   const { isOpen, open, close, openWithData, data } = useModal();
 * 
 *   const handleEdit = (item: Item) => {
 *     openWithData(item);
 *   };
 * 
 *   return (
 *     <>
 *       <Button onClick={() => openWithData({ id: 123 })}>Edit Item</Button>
 *       <Dialog open={isOpen} onOpenChange={close}>
 *         {data && <EditForm item={data} />}
 *       </Dialog>
 *     </>
 *   );
 * }
 * ```
 */
export function useModal(defaultOpen = false): UseModalReturn {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [data, setData] = useState<unknown>(null);

  const open = useCallback(() => {
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    // Clear data when closing
    setData(null);
  }, []);

  const toggle = useCallback(() => {
    setIsOpen(prev => !prev);
    if (isOpen) {
      setData(null);
    }
  }, [isOpen]);

  const openWithData = useCallback((newData: unknown) => {
    setData(newData);
    setIsOpen(true);
  }, []);

  return {
    isOpen,
    open,
    close,
    toggle,
    data,
    setData,
    openWithData,
  };
}

/**
 * Hook for managing multiple modals simultaneously.
 * Useful for complex UIs that need to manage several modal states.
 * 
 * @returns Object with functions to control multiple modals
 * 
 * @example
 * ```typescript
 * function MultiModalComponent() {
 *   const { openModal, closeModal, getModalState } = useMultiModal();
 * 
 *   const editModal = getModalState('edit');
 *   const deleteModal = getModalState('delete');
 * 
 *   return (
 *     <>
 *       <Button onClick={() => openModal('edit', { id: 123 })}>Edit</Button>
 *       <Button onClick={() => openModal('delete', { id: 123 })}>Delete</Button>
 *       
 *       <Dialog open={editModal.isOpen}>
 *         <EditForm item={editModal.data} />
 *       </Dialog>
 *       
 *       <Dialog open={deleteModal.isOpen}>
 *         <DeleteConfirmation item={deleteModal.data} />
 *       </Dialog>
 *     </>
 *   );
 * }
 * ```
 */
export function useMultiModal() {
  const [modals, setModals] = useState<Record<string, { isOpen: boolean; data?: unknown }>>({});

  const openModal = useCallback((modalId: string, data?: unknown) => {
    setModals(prev => ({
      ...prev,
      [modalId]: { isOpen: true, data }
    }));
  }, []);

  const closeModal = useCallback((modalId: string) => {
    setModals(prev => ({
      ...prev,
      [modalId]: { isOpen: false, data: undefined }
    }));
  }, []);

  const toggleModal = useCallback((modalId: string, data?: unknown) => {
    setModals(prev => {
      const current = prev[modalId];
      return {
        ...prev,
        [modalId]: {
          isOpen: !current?.isOpen,
          data: current?.isOpen ? undefined : data
        }
      };
    });
  }, []);

  const getModalState = useCallback((modalId: string) => {
    return modals[modalId] || { isOpen: false, data: undefined };
  }, [modals]);

  const closeAllModals = useCallback(() => {
    setModals({});
  }, []);

  return {
    openModal,
    closeModal,
    toggleModal,
    getModalState,
    closeAllModals,
    modals,
  };
}

/**
 * Hook for managing confirmation modals with customizable content and actions.
 * Ideal for destructive actions that require user confirmation.
 * 
 * @returns Object with confirmation modal state and control functions
 * 
 * @example
 * ```typescript
 * function DeleteButton({ item }: { item: Item }) {
 *   const { isOpen, config, showConfirmation, handleConfirm, handleCancel } = useConfirmationModal();
 * 
 *   const handleDelete = () => {
 *     showConfirmation({
 *       title: 'Delete Item',
 *       message: `Are you sure you want to delete "${item.name}"?`,
 *       confirmText: 'Delete',
 *       cancelText: 'Cancel',
 *       variant: 'destructive',
 *       onConfirm: async () => {
 *         await deleteItem(item.id);
 *         toast.success('Item deleted');
 *       }
 *     });
 *   };
 * 
 *   return (
 *     <>
 *       <Button onClick={handleDelete} variant="destructive">Delete</Button>
 *       <AlertDialog open={isOpen}>
 *         <AlertDialogContent>
 *           <AlertDialogHeader>
 *             <AlertDialogTitle>{config.title}</AlertDialogTitle>
 *             <AlertDialogDescription>{config.message}</AlertDialogDescription>
 *           </AlertDialogHeader>
 *           <AlertDialogFooter>
 *             <AlertDialogCancel onClick={handleCancel}>
 *               {config.cancelText || 'Cancel'}
 *             </AlertDialogCancel>
 *             <AlertDialogAction onClick={handleConfirm}>
 *               {config.confirmText || 'Confirm'}
 *             </AlertDialogAction>
 *           </AlertDialogFooter>
 *         </AlertDialogContent>
 *       </AlertDialog>
 *     </>
 *   );
 * }
 * ```
 */
export function useConfirmationModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [config, setConfig] = useState<{
    title?: string;
    message?: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'default' | 'destructive';
    onConfirm?: () => void | Promise<void>;
    onCancel?: () => void;
  }>({});

  const showConfirmation = useCallback((newConfig: typeof config) => {
    setConfig(newConfig);
    setIsOpen(true);
  }, []);

  const handleConfirm = useCallback(async () => {
    if (config.onConfirm) {
      await config.onConfirm();
    }
    setIsOpen(false);
    setConfig({});
  }, [config]);

  const handleCancel = useCallback(() => {
    if (config.onCancel) {
      config.onCancel();
    }
    setIsOpen(false);
    setConfig({});
  }, [config]);

  return {
    isOpen,
    config,
    showConfirmation,
    handleConfirm,
    handleCancel,
  };
}