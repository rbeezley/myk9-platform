import React from 'react';

interface DogPhotoSectionProps {
  currentPhoto: string;
}

const DogPhotoSection: React.FC<DogPhotoSectionProps> = ({ currentPhoto }) => {
  return (
    <div className="flex flex-col items-center justify-center w-full pt-6">
      <img
        src={currentPhoto || '/placeholder-dog.png'}
        alt="Dog Photo"
        className="w-24 h-24 rounded-full object-cover border shadow mb-2"
      />
    </div>
  );
};

export default DogPhotoSection;