import React, { useState, useRef } from 'react';
import { UploadCloud, Edit2 } from 'lucide-react';
import { logger } from '@/services/LoggingService';

export interface ClubLogoUploadProps {
  logo: string;
  onLogoChange: (logo: string) => void;
  onLogoUpload: (file: File) => Promise<void>;
  isUploading: boolean;
}

const ClubLogoUpload: React.FC<ClubLogoUploadProps> = ({
  logo,
  onLogoChange,
  onLogoUpload,
  isUploading,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('File size should be less than 5MB');
      return;
    }
    try {
      const previewUrl = URL.createObjectURL(file);
      onLogoChange(previewUrl);
      await onLogoUpload(file);
    } catch (error) {
      logger.error('Error uploading logo:', 'clubs', {}, error as Error);
      alert('Failed to upload logo. Please try again.');
    }
  };

  return (
    <div className="relative">
      <div
        className={`relative w-32 h-32 rounded-full overflow-hidden border-2 border-dashed ${
          isHovered ? 'border-blue-500' : 'border-gray-300'
        } transition-colors duration-200 flex items-center justify-center cursor-pointer`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            fileInputRef.current?.click();
          }
        }}
      >
        {logo ? (
          <img src={logo} alt="Club Logo" className="w-full h-full object-cover" />
        ) : (
          <div className="text-gray-400 text-center p-4">
            <UploadCloud className="w-8 h-8 mx-auto mb-1" />
            <span className="text-xs">Upload Logo</span>
          </div>
        )}
        {isHovered && (
          <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center text-white">
            <Edit2 className="w-5 h-5" />
          </div>
        )}
      </div>
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept="image/*"
        onChange={handleFileChange}
        disabled={isUploading}
      />
    </div>
  );
};

export default ClubLogoUpload;
