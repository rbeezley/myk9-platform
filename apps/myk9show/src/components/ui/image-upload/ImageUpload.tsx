/**
 * ImageUpload Component
 *
 * A reusable component for uploading images with preview, validation, and progress.
 */

import React, { useState, useRef, useCallback } from 'react';
import { Camera, Upload, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { getFileValidationInfo } from '@/services/imageUploadService';

export interface ImageUploadProps {
  /** Current image URL */
  currentImage?: string | null | undefined;
  /** Fallback content when no image (e.g., initials or icon) */
  fallback?: React.ReactNode;
  /** Called when a file is selected for upload */
  onUpload: (file: File) => Promise<{ success: boolean; url?: string; error?: string }>;
  /** Called when the image is removed */
  onRemove?: () => void;
  /** Size of the avatar */
  size?: 'sm' | 'md' | 'lg';
  /** Shape of the upload area */
  shape?: 'circle' | 'square';
  /** Whether upload is in progress */
  isUploading?: boolean;
  /** Disabled state */
  disabled?: boolean;
  /** Additional class names */
  className?: string;
}

const sizeClasses = {
  sm: 'w-16 h-16',
  md: 'w-24 h-24',
  lg: 'w-32 h-32',
};

const iconSizes = {
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
};

export function ImageUpload({
  currentImage,
  fallback,
  onUpload,
  onRemove,
  size = 'md',
  shape = 'circle',
  isUploading: externalUploading,
  disabled = false,
  className,
}: ImageUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploading = externalUploading || isUploading;
  const validationInfo = getFileValidationInfo();

  const handleFileSelect = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      setError(null);

      // Create preview
      const preview = URL.createObjectURL(file);
      setPreviewUrl(preview);

      // Start upload
      setIsUploading(true);
      try {
        const result = await onUpload(file);
        if (!result.success) {
          setError(result.error || 'Upload failed');
          setPreviewUrl(null);
        }
      } catch (_err) {
        setError('Upload failed. Please try again.');
        setPreviewUrl(null);
      } finally {
        setIsUploading(false);
        // Clean up preview URL
        URL.revokeObjectURL(preview);
      }

      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [onUpload]
  );

  const handleClick = useCallback(() => {
    if (!disabled && !uploading) {
      fileInputRef.current?.click();
    }
  }, [disabled, uploading]);

  const handleRemove = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setPreviewUrl(null);
      setError(null);
      onRemove?.();
    },
    [onRemove]
  );

  const displayImage = previewUrl || currentImage;
  const showRemoveButton = displayImage && onRemove && !uploading;

  return (
    <div className={cn('relative inline-block', className)}>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={validationInfo.allowedTypes.join(',')}
        onChange={handleFileSelect}
        className="hidden"
        disabled={disabled || uploading}
      />

      {/* Avatar with upload overlay */}
      <div
        className={cn(
          'relative cursor-pointer group',
          disabled && 'cursor-not-allowed opacity-50'
        )}
        onClick={handleClick}
      >
        <Avatar
          className={cn(
            sizeClasses[size],
            shape === 'square' && 'rounded-lg'
          )}
        >
          {displayImage && <AvatarImage src={displayImage} />}
          <AvatarFallback
            className={cn(
              'bg-muted',
              shape === 'square' && 'rounded-lg'
            )}
          >
            {fallback}
          </AvatarFallback>
        </Avatar>

        {/* Upload overlay */}
        <div
          className={cn(
            'absolute inset-0 flex items-center justify-center',
            'bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity',
            shape === 'circle' ? 'rounded-full' : 'rounded-lg',
            uploading && 'opacity-100',
            disabled && 'hidden'
          )}
        >
          {uploading ? (
            <Loader2 className={cn(iconSizes[size], 'text-white animate-spin')} />
          ) : (
            <Camera className={cn(iconSizes[size], 'text-white')} />
          )}
        </div>
      </div>

      {/* Remove button */}
      {showRemoveButton && (
        <Button
          type="button"
          variant="destructive"
          size="icon"
          className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
          onClick={handleRemove}
        >
          <X className="h-3 w-3" />
        </Button>
      )}

      {/* Error message */}
      {error && (
        <p className="text-xs text-destructive mt-2 text-center max-w-[150px]">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Compact upload button variant for forms
 */
export function ImageUploadButton({
  currentImage,
  onUpload,
  onRemove,
  isUploading: externalUploading,
  disabled = false,
  label = 'Upload Photo',
}: {
  currentImage?: string | null;
  onUpload: (file: File) => Promise<{ success: boolean; url?: string; error?: string }>;
  onRemove?: () => void;
  isUploading?: boolean;
  disabled?: boolean;
  label?: string;
}) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploading = externalUploading || isUploading;
  const validationInfo = getFileValidationInfo();

  const handleFileSelect = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      setError(null);
      setIsUploading(true);

      try {
        const result = await onUpload(file);
        if (!result.success) {
          setError(result.error || 'Upload failed');
        }
      } catch (_err) {
        setError('Upload failed. Please try again.');
      } finally {
        setIsUploading(false);
      }

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [onUpload]
  );

  return (
    <div className="space-y-2">
      <input
        ref={fileInputRef}
        type="file"
        accept={validationInfo.allowedTypes.join(',')}
        onChange={handleFileSelect}
        className="hidden"
        disabled={disabled || uploading}
      />

      <div className="flex items-center gap-3">
        {currentImage && (
          <img
            src={currentImage}
            alt="Current"
            className="w-16 h-16 rounded-lg object-cover border border-border/50"
          />
        )}
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                {currentImage ? 'Change Photo' : label}
              </>
            )}
          </Button>
          {currentImage && onRemove && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={onRemove}
              disabled={uploading}
            >
              <X className="h-4 w-4 mr-2" />
              Remove
            </Button>
          )}
        </div>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">
        Max {validationInfo.maxSizeMB}MB. {validationInfo.allowedExtensions.join(', ').toUpperCase()}
      </p>
    </div>
  );
}

export default ImageUpload;
