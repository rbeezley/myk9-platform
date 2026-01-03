import React from 'react';
import './DogCardSkeleton.css';

export const DogCardSkeleton: React.FC = () => {
  return (
    <div className="dog-card skeleton">
      <div className="dog-card-content">
        <div className="dog-card-armband">
          <div className="skeleton-armband shimmer" />
        </div>

        <div className="dog-card-details">
          <div className="skeleton-name shimmer" />
          <div className="skeleton-breed shimmer" />
          <div className="skeleton-handler shimmer" />
        </div>

        <div className="dog-card-action">
          <div className="skeleton-action shimmer" />
        </div>
      </div>
    </div>
  );
};

interface DogCardSkeletonListProps {
  count?: number;
}

export const DogCardSkeletonList: React.FC<DogCardSkeletonListProps> = ({ count = 5 }) => {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <DogCardSkeleton key={i} />
      ))}
    </>
  );
};
