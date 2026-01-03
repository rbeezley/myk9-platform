import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface PhotoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  previewImage: string | null;
  currentPhoto: string;
  isDragging: boolean;
  onDrop: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onFileInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onCancel: () => void;
  onSave: (previewImage: string | null) => void;
  title: string;
  previewAlt?: string;
}

const PhotoDialog: React.FC<PhotoDialogProps> = (props) => {
  const {
    open,
    onOpenChange,
    previewImage,
    currentPhoto,
    isDragging,
    onDrop,
    onDragOver,
    onDragLeave,
    onFileInput,
    onCancel,
    onSave,
    title,
    previewAlt = 'Photo Preview',
  } = props;
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-6 py-4">
          <div
            className={`border-2 border-dashed rounded-lg p-8 ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300'} cursor-pointer flex flex-col items-center justify-center`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          >
            <i className="fas fa-cloud-upload-alt text-3xl text-blue-500 mb-2"></i>
            <p className="text-base font-medium">Drop your image here</p>
            <p className="text-sm text-gray-500">or click to select a file</p>
            <p className="text-xs text-gray-400 mt-2">Supports: JPG, PNG, WEBP (Max 5MB)</p>
          </div>
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept="image/*"
            onChange={onFileInput}
          />
          {(previewImage || currentPhoto) && (
            <div className="flex flex-col items-center">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Preview</h3>
              <div className="w-32 h-32 rounded-full overflow-hidden border-2 border-gray-200">
                <img
                  src={previewImage || currentPhoto}
                  alt={previewAlt}
                  className="w-full h-full object-cover object-top"
                />
              </div>
            </div>
          )}
        </div>
        <DialogFooter className="mt-6">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            className="!rounded-button whitespace-nowrap"
          >
            Cancel
          </Button>
          <Button
            onClick={() => onSave(previewImage)}
            className="bg-gray-900 hover:bg-gray-800 !rounded-button whitespace-nowrap"
            disabled={!previewImage}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PhotoDialog;
