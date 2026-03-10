import { useRef, type ReactNode } from 'react';
import { Camera, Loader2, Trash2 } from 'lucide-react';
import { BRANDING_ALLOWED_TYPES, MAX_FILE_SIZE } from '@/services/imageUploadService';

interface CoverImageUploadProps {
  children: ReactNode;
  editable: boolean;
  hasCover?: boolean;
  isUploading?: boolean;
  onUpload: (file: File) => void;
  onRemove: () => void;
}

export function CoverImageUpload({
  children,
  editable,
  hasCover = false,
  isUploading = false,
  onUpload,
  onRemove,
}: CoverImageUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!BRANDING_ALLOWED_TYPES.includes(file.type)) {
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      return;
    }

    onUpload(file);
    // Reset input so same file can be re-selected
    e.target.value = '';
  }

  if (!editable) {
    return <>{children}</>;
  }

  return (
    <div className="group relative">
      {children}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileChange}
        className="hidden"
        aria-hidden
      />

      {/* Hover overlay */}
      <div className="absolute inset-0 flex items-center justify-center gap-3 rounded-t-xl bg-black/0 opacity-0 transition-all group-hover:bg-black/40 group-hover:opacity-100">
        {isUploading ? (
          <div className="flex items-center gap-2 rounded-lg bg-black/60 px-4 py-2 text-sm text-white">
            <Loader2 className="h-4 w-4 animate-spin" />
            Uploading...
          </div>
        ) : (
          <>
            <button
              type="button"
              aria-label="Change cover"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 rounded-lg bg-black/60 px-4 py-2 text-sm text-white transition-colors hover:bg-black/80"
            >
              <Camera className="h-4 w-4" />
              Change Cover
            </button>

            {hasCover && (
              <button
                type="button"
                aria-label="Remove cover"
                onClick={onRemove}
                className="flex items-center gap-2 rounded-lg bg-red-600/80 px-4 py-2 text-sm text-white transition-colors hover:bg-red-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
